# Support-ticket pain points and blueprint known gaps — gap analysis

> Spec for implementers and for the product owner. It does three things:
>
> 1. **Clusters all 142 support tickets** that the fleet raised in the reference app into 24 pain themes, says which STORM requirement removes each theme, where in STORM it lives, what STORM does today (verified in code) and which gap doc owns the build.
> 2. **Turns the blueprint's known gaps (§10)** into a register of STORM design decisions, so nothing is left as "not captured".
> 3. **Specifies STORM's own in-app support, feedback, help and release-communication flow**, compared with the reference's support-ticket process (§9).
>
> Requirements are STORM requirements in our own words. Blueprint sections are cited as `§n.n`. Tickets are cited as `T-nnn` (the reference app's own ticket numbers; same numbering as `T-` / `#` in docs 01–08). Every ticket is paraphrased; no submitter, crew member, email address or vendor staff name is reproduced.
>
> **Relationship to the other gap docs.** Docs 01–08 own the builds. This doc is the **traceability index** (ticket → theme → owning feature id) and owns only the support / feedback / help / release surfaces that doc 03 does not already define. Doc 03 (`03-fleet-view-administration.md`) remains authoritative for the support-request data model, its core lifecycle (doc 03 workflow 2), Company FAQs and the Help centre (doc 03 §D, §E, workflow 3). Where this doc extends doc 03 (a company helpdesk tier, record-linked reports, error capture, known issues, release notes, support access grants), the extension is marked **(ext. doc 03)** and must be merged into doc 03's migration, not built separately. If the two disagree on a field or a transition, doc 03 wins unless the product owner adopts the change in Open questions.

---

## Scope

### Blueprint sections covered

| § | Topic | Notes |
|---|---|---|
| Exec summary (lines 1–94) | Operating model, engines, build order | Read for context |
| §9 | Support tickets: 142-ticket export, observed workflow, numbers | Core of this doc. State diagram `image27.png` viewed (authoritative) |
| §6.17 | Support ticket state diagram from earlier passes | `image28.png` viewed; superseded by §9 (it lacks Approved, To be invoiced and Cancelled, and orders Testing before cost approval) |
| §10.1–10.3 | Known gaps: unexercised sign-off paths, unopened pages, hidden rules, variants and count discrepancies | Every item turned into a STORM decision (Workflows § 9) |
| §1.4, §3.31, §3.32, §4.13, §4.14, §6.20 | Top-bar help, support ticket and FAQ fields, support and FAQ pages, FAQ lifecycle | Read for the support / help comparison; owned by doc 03 |

### Ticket export analysed

- **All 142 tickets read**, including the description and the vendor's cost-approval text (which, for 34 tickets, holds a write-up of more than 1,000 characters describing what was proposed or built). Each ticket was assigned **one primary pain theme** (24 themes, table A.1) and **one resolution class** (5 classes, table A.2). Totals reconcile with §9: 142 tickets, 15 open, 74 with a cost, US$88,265.
- Export period: June to November 2026 (about 26 tickets a month for one fleet). Classification as filed: Category "General" 109, Vessel "All vessels" 107, Priority "Normal" 129.
- Other facts used below: 18 tickets were started from the in-app chat or support form and carried the user's rank, vessel, contact and page pasted into the text; 15 tickets had an empty description (the requirement lived in an attachment or in the vendor's reply); 21 contained an email address in the title or text; 10 titles were simply a crew member's name; 4 titles were a greeting; 48 tickets had no discussion at all; only 20 of the 74 costed tickets show a recorded approval in the export; median time from creation to last update for completed tickets is 12 days (75th percentile 24, max 93).

### STORM paths inspected (code read, not just names)

- Support / feedback / help: `src/modules/help/pages/{SupportPage,HowToGuidesPage}.tsx`, `src/modules/feedback/{store/feedbackStore.ts,components/FeedbackPanel.tsx,components/FeedbackResolvedToast.tsx,pages/FeedbackAdmin.tsx,types.ts}`, `src/shared/components/layout/{SidebarAccountMenu,DashboardLayout,InkfishFooter}.tsx`, `src/shared/components/ErrorBoundary.tsx`, `src/routes/index.tsx` (`/help/*` lines 183–184, `/admin/feedback` 703–709), `src/config/sitemap.ts` (fleet "Support Tickets" leaf, line 95), `vite.config.ts`
- Migrations: `supabase/migrations/20260917225003_*.sql` (`support_tickets`), `20260228120000_create_feedback_submissions.sql`; `docs/SYSTEM-AUDIT-2026-09-19.md` (H3 never-applied migrations, H7 ungated `/admin/*`, M6 branding not wired, M12 `notification_logs` never read)
- Theme verification (one or more files per theme): `src/modules/crew/components/TransferCrewModal.tsx`, `src/modules/hris/components/documents/requiredDocuments.ts`, `src/modules/certificates/hooks/useCrewCertificates.ts` (`MARITIME_CERTIFICATE_TYPES`), `supabase/migrations/20260127161741_*.sql` (`crew_certificates`), `supabase/functions/review-certificate/index.ts`, `src/modules/work-rest/{components/NonConformityList.tsx,types/index.ts,lib/complianceEngine.ts}`, `src/modules/development/{pages/CourseCatalogue.tsx,components/ApplicationDetailModal.tsx,hooks/useDevelopmentMutations.ts}`, `src/modules/ism/pages/{PermitsToWorkPage,ObservationsPage,MiscellaneousPage,MeetingsPage}.tsx`, `src/modules/ism/forms/{pages/CreateTemplate.tsx,constants.ts}`, `supabase/functions/extract-form-fields`, `src/modules/drills/pages/DrillsAnnualGrid.tsx`, `src/modules/logbooks/lib/templates.ts`, `src/modules/notifications/lib/notificationLinks.ts`, `supabase/functions/send-email/index.ts`, `src/modules/settings/pages/BrandingSettings.tsx`, `src/modules/auth/hooks/useAcknowledgments.ts`, `src/modules/crew/components/{ResetAccountModal,ImportCrewCSVModal}.tsx`, `src/modules/users-access/lib/presets.ts`
- Generated types grepped for table existence: `support_tickets`, `crew_certificates`, `permit_extensions`, `form_template_versions`, `form_amendments`, `sms_amendments`, `document_acknowledgments`, `work_rest_non_conformities`, `development_courses`, `med_vaccinations`, `notification_logs`
- Other gap docs read for feature ids and to avoid contradictions: docs 01–08 in this folder

### Headline findings

1. **The reference's support channel was the fleet's product backlog.** 74 of 142 tickets carried a price (US$88,265). The fleet paid to digitise its own forms, to hide modules, to brand the account and to move a form from one section to another. 60 tickets (42 %) were content authoring, configuration or sign-in help that a well-designed product lets the customer do alone (table A.2).
2. **The real capability gaps cluster around a handful of engines.** 63 tickets (US$73,125) asked for genuine capability, and most of them are the same few engines: company sign-off and "whose move" (incident workflow alone was reworked three times, T-69, T-97, T-153, US$8,550), qualification-requirement logic, hours-of-rest review, controlled transfers, drill scheduling, the permit framework and voyage drafts. STORM must build these once, as engines (doc 08), not per form.
3. **Data integrity failures came from name-matching and from integrations.** 19 tickets were defects; 7 of them came from the external crew-document registry sync (wrong slot, duplicates, deleted items returning) and 3 from requirement matching by name (equivalents shown as missing). STORM's own "required documents" check is a keyword match today (`requiredDocuments.ts`), the same pattern.
4. **Change was delivered through tickets, not through the product.** 34 tickets hold long proposals or "what was built" write-ups inside the cost-approval text; one asks users to hard-refresh to see a change (T-289); several point to a separate preview site. Users had no in-app "what's new", no update prompt and no list of known issues.
5. **STORM's support surfaces are not usable yet.** `support_tickets` is write-only (no status change is possible for anyone but the service role), the page shows only the user's last ten tickets and claims a confirmation email that is never sent, and its SELECT policy lets any DPA or superadmin role holder read **every tenant's** tickets. The "Report an issue" panel in every layout writes to `feedback_submissions`, a table whose migration was never applied live, so every submission fails silently. Help is hard-coded (`HowToGuidesPage.tsx`), there are no FAQs, no assistant, no error reporting (`ErrorBoundary.componentDidCatch` only logs to the console) and no build version (`VITE_APP_VERSION` is never defined, so every report would say "1.0.0").
6. **Where STORM is already ahead.** The ISM form builder (`CreateTemplate.tsx`) already offers 14 field types, AI extraction of fields from an uploaded document (`extract-form-fields`), fleet / vessel / department scope and signature slots, which is the foundation for removing the largest ticket theme (21 bespoke form builds). Hours of rest has a real compliance engine with captain acceptance of non-conformities (`NonConformityList.tsx`) — but its migration was never applied live (SYSTEM-AUDIT H3). Training applications already have a HoD → Purser → Captain review chain with comments and "returned". The logbooks module already records bunker grade and sulphur. Branding settings already persist a logo and colour.

---

## Target information architecture

This domain has no module tab of its own. It owns global help and support surfaces, one Fleet administration area, the STORM staff console pages for support, and three behaviours inside every vessel module. Routes follow doc 01 (vessel pages under `/v/:vesselCode/…`) and extend doc 03's Help / Support tree.

### Global, both views (top bar and account menu)

```
Help (?) in top bar  [badge = replies waiting on you + unread "What's new"]
  popover: search box · "For this page" (top FAQs for the current module) ·
           Report a problem · Ask for a change · My requests · What's new · Help centre
  Help centre ............. /help?q=&category=&module=                 platform FAQs + this account's Company FAQs (doc 03 E4)
  FAQ entry ............... /help/faqs/:faqId                          "Was this helpful?" + "Still stuck? Contact support"
  Suggest a question ...... /help/suggest                              (doc 03 E3)
  What's new .............. /help/whats-new?module=                    release notes, newest first, per module
  Known issues ............ /help/known-issues?module=                 issues affecting this account, with workaround and status
  My requests ............. /help/requests?tab=open|completed          requests I raised or contribute to (doc 03)
  New request ............. /help/requests/new?type=&from=<path>&record=<kind:ref>&error=<id>
  Request detail .......... /help/requests/:ref                        progress strip with "whose move"
Account menu › Report an issue  → same quick panel as Help › Report a problem (keeps today's entry point)
Error screen               → "Report this error" (pre-fills type = bug, error id, page) and "Try again" (never navigates away from unsaved input)
Update banner              → "A new version of STORM is ready · Reload · What's new" (shown when the running build is older than the deployed one)
```

### Fleet view › Administration › Support (extends doc 03 §D)

```
Support ............................ /fleet/admin/support?queue=helpdesk|storm|all&tab=open|completed|insights
│                                     badge = items waiting on your company (helpdesk queue + STORM requests waiting on you)
├─ Helpdesk queue (company tier) ... /fleet/admin/support?queue=helpdesk     crew requests not yet sent to STORM   (ext. doc 03)
├─ Requests with STORM ............. /fleet/admin/support?queue=storm        doc 03 D1
├─ Request detail .................. /fleet/admin/support/:ref               doc 03 D3 + Escalate / Resolve internally actions
├─ Insights (P2) ................... /fleet/admin/support?tab=insights       requests by theme, module, whose move, time to resolve
├─ Support settings ................ /fleet/admin/support/settings           helpdesk members, auto-escalate, urgent bypass, screenshots, access approvers
└─ Support access .................. /fleet/admin/support/access             grants to STORM staff: pending / active / past, revoke
Company FAQs ....................... /fleet/admin/faqs                        doc 03 §E (unchanged)
```

Capabilities (names follow `docs/permissions/` and doc 03): `fleet.administration.support_tickets.view` (doc 03), `.approve` (doc 03, cost approval), new `.triage` (helpdesk member: resolve internally, escalate, merge), new `.access_approve` (approve STORM support access; default owner and DPA-flagged admins).

### Vessel view behaviours (no pages of its own)

1. **Record-level report.** Every record header (incident, permit, certificate, crew document, form, HoR month, voyage plan…) has an overflow item "Report a problem with this record". It opens the quick panel with the record kind, reference and vessel attached as a link, never as copied data (fixes tickets that pasted names and record details into text, e.g. T-326, T-314, T-25, T-107, T-222).
2. **Known-issue banner.** When a confirmed known issue affects the current module for this account, a slim banner sits under the module tab bar: title, workaround link, "Follow" (adds the user as a contributor to the linked improvement). Dismissible per user until the issue's status changes.
3. **Explain, don't hide.** Switched-off modules, locked add-ons and missing permissions show an explanation card with who can change it (doc 03 vessel behaviours 1–2; doc 01 F44 inspector), plus "Ask for a change" pre-filled for the person's helpdesk. This turns T-51, T-138 and T-211 style tickets into one click to the right internal person.

### Platform console (STORM staff only, `is_platform_staff()`, doc 01 F3)

```
/platform/support ............. triage queue across tenants (doc 03 D10) + ?view=themes (board by pain theme)
/platform/support/:ref ........ detail with internal notes, theme / resolution class tagging, merge, link to known issue
/platform/known-issues ........ issues and planned improvements; /platform/known-issues/:id
/platform/errors .............. client error groups by fingerprint (count, users, first / last seen, build), link to issue
/platform/releases ............ release notes authoring; /platform/releases/:version
/platform/flags ............... preview flags and which accounts opted in
/platform/faqs ................ platform FAQs (doc 03 E5)
```

### Where each pain theme is fixed (Fleet or Vessel view)

The theme table A.1 names the module for each theme. In short: crew documents, transfers, hours of rest, planner, visitors, permits, SMS forms, risk assessments, drills, HESS and voyages are fixed in the **Vessel view** with fleet roll-ups; the form / checklist / permit-type builder, catalogues and requirement matrices, Users & Access, notification routing, vessel module settings, branding, training catalogue and integrations are fixed in the **Fleet view › Administration / Operations** pages.

### Legacy routes (redirect for one release)

| Today | Target |
|---|---|
| `/help/how-to-guides` | `/help` |
| `/help/support` | `/help/requests/new` (form) and `/help/requests` (list) |
| `/admin/feedback` | `/platform/support?source=quick` (staff) or `/fleet/admin/support` (tenant) |
| sitemap "Support Tickets" → `/help/support` | `/fleet/admin/support` |

---

## Feature inventory

### A.1 Pain-theme clustering (all 142 tickets)

Status is STORM's status **for the requirement that fixes the theme**, verified in code. "Spec" names the gap doc and feature ids that own the build. Count = tickets whose primary theme this is.

| # | Theme | Count (open) · cost | Example problems (paraphrased) | STORM requirement that fixes it | STORM module · spec | STORM today | Priority |
|---|---|---|---|---|---|---|---|
| A | Crew certificates, documents and qualification matrix | 14 (1) · US$3,900 | Matrix showed certificates as missing although an accepted equivalent was on file (T-326). A combined basic-safety certificate hid that single modules were missing (T-159). Holding a higher certificate should drop the lower requirement (T-53). A verified document stayed verified after the holder edited it (T-139). Verification existed only for STCW, not passport, medical, visa or discharge book (T-31). Non-standard medicals landed in the wrong section (T-185); a missing discharge book was not flagged (T-190). Crew could mute expiry alerts on their own documents (T-160). Vendor had to add a position's requirements (T-135), a certificate variant (T-125) and ship-specific ECDIS type names (T-245). A dual-category visa could not be saved to the right slot (T-77). Reports lacked Rejected / Conditionally approved filters (T-248). | Typed document catalogue (code, category, validity rule) with explicit "satisfies" relations: equivalents, supersession, combined certificates, any-of groups; vessel-equipment variants (e.g. ECDIS make per vessel). Per-vessel position-requirements matrix edited by fleet HR. Four-state verification on every category, reset to Unverified on any material edit, verifiers notified. Mute alerts only with capability. A document may fill more than one slot. | Vessel › Crew › Compliance and Documents; Fleet › Crew catalogue · doc 04 C24–C35, W4; doc 01 F35 | partial: `crew_certificates` has no verification columns; type is free text from ~40 hard-coded names (`MARITIME_CERTIFICATE_TYPES`); "required documents" is a 7-item keyword match (`requiredDocuments.ts`); `training_matrix` has no writer UI | P0 |
| B | External crew-document registry sync | 10 (1) · US$4,050 | Imported certificates landed on the wrong line: refresher on the original course, combined versus single (T-215, T-222, T-213). One course arrived as two certificates (T-157). Expired documents were imported and flagged as compliance gaps (T-145). Certificates deleted locally came back after the registry reclassified them, duplicating records for several crew (T-275). Fear that a re-sync would undo manual verifications (T-187). Registry-verified items showed Pending (T-141). | If adopted: the registry's document id is the permanent key, kept through edits and remembered after deletion (tombstone); "updated" events only update; mapping uses the registry's structured classification, never the title; sync **proposes** into a review queue (new / changed / conflict) and never overwrites a human verification; expired imports are marked historical, not missing; per-crew link status and a sync log visible to admins; failures raise an admin alert. | Vessel › Crew › Documents (import review); Fleet › Integrations · doc 04 C32 | missing (no registry integration; nearest is the Airtable roster sync `supabase/functions/airtable-sync`) | P2 (P1 if crew already hold registry profiles, Open question 8) |
| C | Sign-in and invitations | 5 · US$0 | Invitations never arrived although the address was right and they were resent several times (T-120, T-278, T-282). Password reset refused because the invite was not yet accepted (T-120). A user knew only the phone app and could not sign in on a computer (T-313). An engineer was locked out and a colleague raised it through chat (T-325). | Invite delivery status (sent, delivered, bounced, accepted), copy invite link, resend with cooldown, "forgot password" before acceptance re-sends the invite, last sign-in shown to admins, MFA reset by admin; a "Can't sign in?" page; sign-in requests from crew go to the company helpdesk, not to STORM (Workflow 1). | Fleet › Users & Access; Help · doc 03 B7; doc 01 W2 | partial: resend exists (`ResetAccountModal.tsx`, `CrewRoster.tsx`); no delivery or bounce status; `notification_logs` never read | P0 |
| D | Permissions and access model | 5 · US$1,350 | Some ranks could only print forms and permits, not open them (T-51). A user lost access to crew profiles overnight with no visible change (T-138). Access should default from the position at invite, and shore admins should not get whole-fleet access by default (T-40). Per-person permission grid with medical badge (T-146); named on-board role badges (T-147). | Position → default Access Set at invite; shore / fleet users must pick vessels and modules before the invite is sent; matrix with bulk edit; effective-permission inspector ("why can't this person open X on Draak?"); visible change history; designated vessel roles as badges. | Fleet › Users & Access · doc 01 F30, F34, F35, F40, F44; doc 02 FC8 | partial: `src/modules/users-access/*` (presets, capability catalogue, overrides, department scope); no position defaults, no inspector, no history UI over `permission_audit_log` | P0 |
| E | Crew transfers between vessels | 6 · US$3,750 | A captain who existed on a vessel the user could not see had to be moved by the vendor (T-26); a former temporary crew member from another vessel could not be added (T-72). A transfer must re-check the receiving vessel's matrix and review open medical, rest-hour and familiarisation items (T-39). Senior crew should transfer without seeing pay data, and the DPA should be told (T-96, T-121). Unfinished rest hours on the previous vessel after a move (T-133). | One person record across the fleet; search-before-create finds people on other vessels; controlled transfer with pre-transfer review, receiving-vessel compliance re-check, approval, DPA notification, its own capability; outstanding rest-hour months follow the person as a task, approved by the vessel where the hours were worked. | Vessel › Crew › People › Transfer · doc 04 C58; doc 01 (transfer capability); doc 03 (`crew_transfer_recorded` to DPA) | partial: `TransferCrewModal.tsx` (vessel, position, date, notes) with no review, re-check or notifications | P0 |
| F | Hours of rest | 7 (2) · US$4,200 | Breaches were visible but could not be accepted or flagged; no shortfall column; no consolidated report (T-142). The card opened on daily input instead of the month (T-143). A crew member was on the report but not on the month list (T-144). HoDs wanted a nudge before the captain approves (T-148). A crew member could not enter hours (T-211). Reminders at month start and at sign-off (T-286). Old breaches hid behind a month picker (T-292). | Breach review (accept with note / flag), severity classes, shortfall columns, consolidated vessel breach report sent by a person (never automatic), reminders (1st and 8th of the month, day of sign-off), HoD nudge, overview across all months, sign-off on behalf of departed crew, "enabled from" date, explanation when entry is not possible. | Vessel › Crew › Hours of Rest; Fleet › Reports › HoR · doc 04 C40–C45, W6; doc 02 R9 | partial and **not live**: engine, signatures and captain acceptance exist (`src/modules/work-rest/*`), but `20260501100000_work_rest_module.sql` was never applied to the live database (SYSTEM-AUDIT H3); no reminders, no breach report | P0 |
| G | Planner, rotations, leave and contracts | 7 (2) · US$5,250 | One leave entry should hold several segments (leave, travel day, leave) instead of three entries (T-71). New contract and leave types (T-52). Month zoom, weeks-and-days durations, drag to create (T-27). A nightly import from the master rotation spreadsheet stopped silently when the sheet's layout changed (T-228, T-316). Forecast crew list for a future date (T-306). | Multi-segment leave periods; contract-type catalogue editable by HR; planner interactions per doc 04; every integration shows last run, next run, rows matched and fails loudly (banner + admin alert) with a layout check; forecast crew list exportable as a crew list for a port call. | Vessel › Crew › Planner; Fleet › Integrations · doc 04 C47–C56 (C50 multi-period leave, C54 spreadsheet import); doc 07 V23, V24 | partial: `src/modules/rotation-planner/*`, `frp_*` tables, Airtable roster sync; no sync-health line on the planner; no forecast list | P1 |
| H | Non-crew aboard: occasional workers, visitors, shore staff | 2 (1) · US$9,900 | Occasional workers must appear on the onboard list and crew-list export but be excluded from crew compliance, rest hours, manning and agreements, with a linked declaration (T-32). Shore staff need logins limited to their vessels and modules with no admin rights; visitors need one profile reused across visits (T-302). | Person kinds (crew, occasional worker, visitor, shore staff) on one person model; visits with embark / disembark, declaration, one vessel at a time; shore-staff landing rules. | Vessel › Crew › Visitors & occasional workers; Fleet › Visits; Fleet › Users & Access · doc 04 C68–C69; doc 02 V4–V5; doc 07 G6; doc 01 F24 | missing (no occasional-worker or visitor model; the crew list mixes contractors and shore staff as profiles) | P1 |
| I | Training catalogue and applications | 5 · US$5,100 | The course list was locked; admins could not add a course and its rules (T-149). Approvers needed to correct or comment on an application, with the crew member told and an audit trail (T-200, T-202). Test or mistaken applications could not be removed (T-201). | Course catalogue editing with rules (validity, renewal, applicability, mandatory); approver amendments recorded and notified; send back; void with reason. | Fleet › Training; Vessel › Crew › Training · doc 02 TR5–TR7 | partial: review chain with comments and "returned" (`ApplicationDetailModal.tsx`); catalogue is read-only in the UI (`CourseCatalogue.tsx`); no void | P1 |
| J | Crew health records | 1 · US$1,200 | Vaccinations with booster dates and occupational health checks (dental, hearing, annual, dive and submersible medicals), shown per crew and fleet-wide (T-8). | Vaccination register and occupational-health dates feeding the expiry engine; fleet medical overview. | Health & Wellness; Vessel › Crew › Medical · doc 02 M2–M3 | partial: `med_vaccinations` and related tables used by `usePatientRecord.ts` | P2 |
| K | Incident, medical case and safety observation workflow | 6 (1) · US$13,350 | Reports read "Completed" while the Master had not signed and the company had not reviewed (T-69, T-78). Sequential case numbers by vessel and year; fit-for-duty and time-off bands that prompt flag-state reporting with a neutral draft that omits the person's name by default (T-42). Updates added as a log instead of overwriting the submitted report; injury linked to a medical case (T-69). The workflow was rebuilt from eight stages to three words plus a conversation (T-97, T-153). A crew-wide safety observation report with its own permissions (T-287). | One record envelope: Draft → Open (with "whose move") → Closed; only the company closes; submitted snapshot plus update thread; flag reporting profiles; observation report open to every crew member, escalable to an incident. | Vessel › Safety › SMS forms and Observations; Fleet › Safety queue · doc 05 INC7–INC11, MED1–MED7, OBS1–OBS2, FRM3, SET4, NAV3; doc 08 CO1–CO10, TH1–TH5 | partial / placeholder: `src/modules/incidents/*` is generic (Open / Under Investigation / Closed, numbers made in the browser); no company actor; `ObservationsPage.tsx` renders mock data | P0 |
| L | SMS forms framework: chasing, lists, correcting signed records | 5 (1) · US$1,650 | No way to chase a form sitting with someone; accident reports never submitted to the company (T-131). A monthly report could only be closed by the shore superintendent, so the Chief Engineer emailed to say it was ready (T-74). Unsigned drafts could not be deleted and piled up; fleet template edits did not reach vessel copies; a history tab was wanted (T-25). A signed meeting record had items in the wrong section (T-314). Open and completed forms were mixed in one list (T-150). | "Whose move" chip and age on every row; nudge / remind; follow-up dates; per-template "submit, then company signs off"; completion routing; author can delete own unsigned drafts; template versions reach vessels (in-flight records keep their version); per-type history; amendment cycle for signed records with re-sign. | Vessel › Safety › SMS forms; Fleet › Forms & Checklists · doc 05 FRM3, FRM9, FRM11, FRM13, FRM14, HES7; doc 08 REG3, SIG15, TH5 | partial: ISM forms engine (server numbering, content hash, ordered signatures, lock and amend; `MyDrafts`, `PendingSignatures`); no company actor, no whose-move, no chase; the vessel "SMS Forms" leaf opens a static page (`MiscellaneousPage.tsx`) | P0 |
| M | Permits to work and isolations | 10 (1) · US$8,700 | Six permit types reworded and re-laid out after crew testing; three types removed and two folded into a general hazardous-work permit (T-100, T-101, T-103, T-111). A bunkering permit built from the fleet's own checklist (T-289). Extension inside a 12-hour cap (T-294). Isolation (lock-out / tag-out) certificate as its own record with permit-level permissions (T-38, T-301). The permit card should show location and task (T-151). One layout and vocabulary across all permits (T-242, US$7,200). | Fleet-editable permit-type catalogue (sections, checklists, validity cap, extension rule, gas readings), isolation certificate as a linked record type, standard section order, informative permit cards. | Vessel › Safety › Permits; Fleet › Forms & Checklists › Permits · doc 05 PTW1–PTW10; doc 02 FC7 | placeholder: `PermitsToWorkPage.tsx` renders mock permits; the real `work_permits` / `permit_extensions` sit in a Risk Assessments tab and record the requester as approver (doc 05 finding 10) | P0 |
| N | Risk assessments | 2 · US$0 | Company approval needed save-as-draft and reopen before the approve button worked (T-33). A company rejection did not change the status or show the comment; approvals were listed in a confusing order (T-34). | Company decision in one action with comment (approved, approved with conditions, not approved); status reflects it; approvals newest first. | Vessel › Safety › Risk assessments · doc 05 RA7–RA8; doc 08 CO3 | partial: `src/modules/risk-assessments/*` stores hazards; no company decision; `/risk-assessments/new` is a static page | P0 |
| O | Drills | 3 · US$4,050 | The schedule started from the month a drill was added, not when the requirement applied; backdating needed with evidence, "not applicable" with reason, or left overdue (T-44). The completion pop-up was too thin to be the drill report (T-44). A 4-monthly cadence and a submersible-operations category (T-261). Drills were hard to find in the menu (T-43). | Per-vessel drill configuration with "applicable from", calendar or rolling schedule, any n-month cadence, categories and event-triggered drills; honest backfill; visible N/A; full drill report. | Vessel › Safety › Drills · doc 05 DRL4–DRL10 | partial: `src/modules/drills/*`; `drill_types` is a global 12-row table with frequency in days; the annual grid is hard-coded (`DrillsAnnualGrid.tsx`); `complete-drill` is never called | P0 |
| P | HESS (safety committee) meetings | 2 (1) · US$1,050 | Items could not be marked completed; unwanted absence field; certificate expiries and notices not imported; drill imports too wordy; "other business" was one big box; the print ran to 17 pages (T-70). Read view, digest and condensed print (T-290). | Structured minutes with imports, actions with owners carried forward, read view, condensed PDF. | Vessel › Safety › SMS forms › HESS · doc 05 HES1–HES7 | missing (`MeetingsPage.tsx` lists fleet management reviews) | P1 |
| Q | Bespoke form and checklist builds | 21 · US$9,140 | The fleet paid the vendor to digitise its own handovers, familiarisation forms, emergency notification and situation-report forms, voyage and operational checklists, a motorman's daily round, a critical-equipment list and a bunker request that emails the technical office (T-2, T-3, T-5, T-6, T-15, T-16, T-22, T-24, T-28, T-29, T-73, T-122, T-134, T-165, T-174, T-254, T-258); to move forms between sections (T-18, T-112, T-226); to make a vessel form fleet-wide (T-13). One "Urgent" ticket was a form build. | The fleet authors its own templates: import from Word / PDF with AI field extraction, choose where crews find it (area), scope (fleet / vessels / departments), signature slots by vessel office, company step on / off, completion routing (notify a group or a shore mailbox), tablet layout, move between areas, customise a STORM standard, version history, per-vessel hide. STORM ships a standard content library. | Fleet › Forms & Checklists · doc 02 FC1–FC8; doc 05 OTH1–OTH3 | partial, strong base: `CreateTemplate.tsx` (14 field types, AI extraction via `extract-form-fields`, vessel / department scope, signature slots); missing crew-picker field, area placement and per-vessel visibility, completion routing, company step, version propagation (`form_template_versions` exists in types but no code reads it) | P0 |
| R | Document control and acknowledgement | 4 (1) · US$1,575 | SMS amendment request with a conditional hard-copy step and company action by DPA, technical or operations (T-80); change order linked to the safety meeting (T-4); bulk import of SOPs (T-132); per-person acknowledgement targeted by department, position or name, with reminders (T-285). | Document change request with conditional stages; per-vessel or per-person acknowledgement modes; remind; bulk upload into document types. | Fleet › Documents; Vessel › Safety › Documents · doc 05 (document change request, OTH3); doc 02 FD11 and fleet documents rows | partial: `document_acknowledgments` (one row per user per document), `DocumentAcknowledgementsPage.tsx`; `sms_amendments` / `form_amendments` tables have no UI; no bulk upload | P1 |
| S | Voyage, movement reports, fuel and emissions | 9 (3) · US$4,800 | Several draft passage plans in parallel and copy a previous plan (T-11, T-19, T-41); more reporting points (T-49); five bridge-team acknowledgements (T-50). Unused fuel types should be removable (T-23); the noon report assumed one main engine (T-324); the bunker report had no fuel-type field (T-327). Emissions from movement reports (T-232). | A vessel machinery and fuel profile drives report fields; passage plans with versions, statuses and read-and-agreed acknowledgements; emissions computed from movement reports. | Vessel › Vessel › Voyages; Fleet › Reports › Emissions · doc 07 V4, V5, V10, V11, V16, VC3, VC4, RV20 | partial: logbook templates have a noon report with one fuel figure and "Generator 1" fields, and a bunker record with a free-text grade (`logbooks/lib/templates.ts`); no passage plans; no emissions | P1 |
| T | Tenant configuration: hide modules or items, branding | 5 · US$1,950 | Paid to hide the leave module everywhere (T-10). Hide technical items and templates covered by an external maintenance system (T-12, T-14, T-21). Account branding (T-136). | Per-vessel module on / off and labels; hide a template or item per vessel; branding applied to the theme and PDFs. | Fleet › Administration › Vessel Settings and Account · doc 01 (vessel module settings); doc 03 §G; doc 07 CAL8 | partial: `BrandingSettings.tsx` saves logo and colour but the colour is not applied (SYSTEM-AUDIT M6); module access is company / role level (`modules`, `user_has_module_access`); no per-vessel switches | P1 |
| U | UI papercuts and reliability | 6 · US$0 | A pop-up covered the Save button (T-58). Next-of-kin phone numbers showed a doubled "+" (T-68). Error pages interrupted work and lost input (T-92). An uploaded JPEG showed only its file name (T-107). Crew pickers were unsorted and unsearchable (T-166). Issuer autocomplete stopped working (T-170). | Nothing overlays primary actions; phone stored once in international format; crash-safe drafts and error reporting; image previews (HEIC included); searchable alphabetical crew pickers; remembered values for repetitive fields. | All modules · doc 08 SV5, SV7, UP4; doc 05 OTH5; this doc SUP7 | partial: `ErrorBoundary.tsx` logs to the console only; ISM forms keep server drafts; no global draft safety | P1 |
| V | Notifications and email | 3 · US$750 | Email buttons opened the general forms list, not the record, and carried no excerpt (T-252). A verifier was emailed for some uploads and not others, and verification did not reset on edit (T-163). Personal preferences and admin routing were separate settings (T-79). | Deep link to the exact record with an excerpt; delivery log a person and an admin can read; one preference row behind both windows. | Global · doc 03 C7, C11; doc 08 NO3 | partial: `notificationLinks.ts` maps keywords to list pages (`/incidents`, `/ism/drills`); `notification_logs` is written but never read | P0 |
| W | Help, FAQ and add-on requests | 2 · US$0 | The in-app AI help gave unreliable answers; a searchable FAQ with categories, feedback and suggest-a-question was requested, with the AI grounded on it (T-288). A crew request for an add-on became a support ticket (T-268). | Help centre with platform and Company FAQs, contextual help, suggestions, grounded assistant later; add-on request as its own object. | Global Help; Fleet › Company FAQs, Add-ons · doc 03 A2, E1–E6, F5; this doc SUP17–SUP20 | placeholder: `HowToGuidesPage.tsx` is hard-coded; no FAQ tables; no assistant; no add-on request | P1 |
| X | Data onboarding and bulk import | 2 · US$2,550 | The vendor loaded 75 risk assessments for one vessel (T-17). Bulk upload of crew documents with AI extraction, plus paid loading of all documents for two vessels (T-46). | Import tools the fleet runs itself: risk-assessment library from a spreadsheet template; crew-document bulk upload with AI classification into a review queue. | Fleet › Documents, Risk assessments, Crew · doc 08 UP6; doc 02 FD11; doc 04 (T-46) | partial: crew CSV import (`ImportCrewCSVModal.tsx`, `parse-crew-csv`), AI field extraction for templates; no document bulk import, no RA import | P1 |

Totals: 142 tickets, 15 open, US$88,265 (matches §9).

### A.2 Resolution classes: what STORM must make unnecessary

Each ticket was also classed by what kind of work it really was. The first three classes should not reach STORM engineering at all in a well-designed product.

| Class | Tickets | Cost in the reference | Ticket numbers | What STORM must provide so these never become tickets |
|---|---|---|---|---|
| R1 Content authoring (the fleet's own forms, checklists, permits, drills, RA libraries) | 27 | US$11,390 | T-2, 3, 5, 6, 13, 15, 16, 17, 22, 24, 28, 29, 38, 73, 100, 101, 103, 111, 122, 134, 165, 174, 254, 258, 261, 289, 301 | Builder + import + standard library (theme Q), permit-type and drill-type configuration (M, O), RA library import (X) |
| R2 Configuration and housekeeping (catalogue entries, requirements, module visibility, moving items between sections, transfers enablement, branding, deleting drafts) | 25 | US$3,300 | T-10, 12, 14, 18, 21, 23, 25, 26, 43, 52, 72, 77, 96, 112, 121, 125, 135, 136, 147, 160, 185, 190, 226, 245, 268 | An admin page for every catalogue and switch (themes A, D, E, T, Q), "Ask for a change" routed to the company's config owners (Workflow 3) |
| R3 Sign-in and access help | 8 | US$0 | T-51, 120, 138, 211, 278, 282, 313, 325 | Invite status, self-service sign-in help, effective-permission inspector, company helpdesk tier (Workflow 1) |
| R4 Defects and integration faults | 19 | US$450 | T-33, 34, 58, 68, 92, 107, 143, 144, 145, 157, 163, 170, 187, 213, 215, 222, 275, 316, 326 | Typed requirement logic, integration rules (theme B), error capture with build version, known-issues register (Workflows 2, 4) |
| R5 Genuine product capability | 63 | US$73,125 | T-4, 7, 8, 9, 11, 19, 20, 27, 31, 32, 39, 40, 41, 42, 44, 45, 46, 49, 50, 53, 69, 70, 71, 74, 78, 79, 80, 97, 131, 132, 133, 139, 141, 142, 146, 148, 149, 150, 151, 153, 159, 166, 191, 200, 201, 202, 228, 232, 242, 248, 252, 285, 286, 287, 288, 290, 292, 294, 302, 306, 314, 324, 327 | Built natively by docs 01–08 before the fleet goes live |

### A.3 Domain features owned by this doc (support, feedback, help, releases, known gaps)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| SUP1 Tenant isolation and honesty fixes on support | §4.13 | partial (bug) | `supabase/migrations/20260917225003_*.sql` SELECT policy; `SupportPage.tsx` success text | Add company check to SELECT (today any DPA / superadmin role holder reads all tenants); stop claiming a confirmation email until one is sent; move hard-coded vendor contact details to platform settings (doc 03 D11) | P0 | S |
| SUP2 Support request core: list, detail, lifecycle, comments, attachments, contributors, read state, cost approval | §3.31, §4.13, §6.17, §9, `image27` | partial | `SupportPage.tsx` (insert + own last ten); table has no UPDATE grant | Exactly as doc 03 D1–D8 and workflow 2; this doc only adds columns listed in Data model | P0 | M |
| SUP3 Request types that route work, plus automatic context | §3.31 (category, vessel) | partial | `SupportPage.tsx` categories technical / data / access / feature / training / other | Doc 03 category keys with plain labels: Something's broken (`bug`), How do I… (`how_to`), Sign-in or access (`access`), Fix data on a record (`data_correction`), Change our setup (`configuration`), Idea (`feature_request`), Billing, Other. Context captured: page path, module, vessel, record link, role, build version and sha, browser. Title rules: 5–150 chars; greeting-only titles ("Hi", "Good morning") rejected with a suggested title from the first sentence | P0 | S |
| SUP4 Company helpdesk tier (crew requests reach the company first) | §9 (all tickets went straight to the vendor) | missing | — | `queue` = helpdesk / storm; helpdesk members resolve internally or escalate; auto-escalate after N business hours; urgent bypass (Workflow 1) (ext. doc 03; answers doc 03 Open question 2) | P1 | M |
| SUP5 Record-linked "Report a problem with this record" | — | missing | — | Overflow action on every record header; stores record kind, reference and vessel; staff can open the record only under a support access grant (SUP14) | P1 | S |
| SUP6 Quick report panel (replaces the feedback panel) | §4.13 "Message <vendor>" (not captured, §10.2) | partial (broken) | `src/modules/feedback/*`; writes to `feedback_submissions` (never applied live); `feedback-screenshots` bucket absent; upload errors swallowed | Same slide-in shell; writes a support request with `source = quick`; optional screenshot with consent and a redaction step; last 20 navigation breadcrumbs (route names and action names only, no typed values); retire `feedback_submissions` and `/admin/feedback` (doc 03 D9) | P1 | M |
| SUP7 Client error capture and "Report this error" | — (ticket T-92) | missing | `ErrorBoundary.tsx` console only; `window.onerror` not handled | Error id, fingerprint, route, build, browser stored (scrubbed); grouped in `/platform/errors`; fallback screen keeps unsaved input and offers Report / Try again; rate-limited (Workflow 2) | P1 | M |
| SUP8 Answer-before-asking: FAQ and similar-request suggestions while typing | §4.14 (#288 theme) | missing | — | Search FAQs, known issues and the account's open requests as the title is typed; "This is my problem too" adds the user as a contributor instead of a duplicate (doc 03 improvement 4) | P1 | S |
| SUP9 Known issues and planned improvements register | — | missing | — | Staff-authored public records linked to requests and error groups; status shown in Help and as an in-module banner with workaround; linked requesters told on status change (Workflow 4) | P1 | M |
| SUP10 What's new (release notes) | — (34 tickets carried proposals or release notes in the cost text) | missing | — | Per-release notes by module, badge on Help until read, linked requesters told when their request ships, printable for crew briefings (Workflow 5) | P1 | S |
| SUP11 Build version and update prompt | — (T-289 "hard-refresh to see it") | missing | `vite.config.ts` defines no version; `VITE_APP_VERSION` undefined, so the panel reports "1.0.0" | Version + git sha baked into the build and `version.json`; check on focus and every 10 minutes; banner to reload; never reloads a page with unsaved input (Workflow 5) | P1 | S |
| SUP12 Preview features per account | — (preview links in T-136, T-146, T-150, T-153) | missing | — | Feature flags with states off / preview / on / retired; owner opts the account in; "Try it" toggle on the module; feedback on a preview goes to a request linked to the flag (Workflow 5) | P2 | M |
| SUP13 STORM staff triage console with theme tagging | §9 (vendor side) | missing | `FeedbackAdmin.tsx` reads the broken table; `/admin/*` ungated (SYSTEM-AUDIT H7) | `/platform/support` (doc 03 D10) plus theme key, resolution class, merge, link to known issue, SLA timers, themes board, monthly "recurring theme" report (Workflow 6) | P0 | L |
| SUP14 Support access grants | — | missing | — | Time-boxed, scoped (vessels, modules, record references), approved by owner or DPA, every read logged and visible to the DPA; replaces pasting personal data into ticket text (Workflow 7) | P1 | M |
| SUP15 Personal-data guard in request text | — (21 tickets held email addresses; 10 titles were a person's name) | missing | — | Warn when a title or description contains an email, phone, passport-like or seafarer-id-like number, or matches a crew member's full name; suggest "Link the record instead"; staff redaction tool that keeps an audit note | P1 | S |
| SUP16 "Ask for a change" to the company's setup | — (R1 / R2 tickets) | missing | — | Request type `configuration` routed by target (form / checklist / permit type / drill type / position requirement / document type / module visibility / notification routing) to the capability holders who can make it; resolved with a link to the changed item; escalate to STORM for assisted setup (Workflow 3). Controlled SMS documents use doc 05's document change request instead | P1 | M |
| SUP17 Help centre and Company FAQs | §3.32, §4.14, §6.20 | placeholder | `HowToGuidesPage.tsx` hard-coded `GUIDE_CATEGORIES`; Settings `SupportSection.tsx` static mock | Doc 03 E1–E5 unchanged; seed platform FAQs from today's guides | P1 | M |
| SUP18 Contextual Help (?) popover in top bar | §1.4 (help "?" with badge) | missing | Help reachable from account menu and footer only | Doc 03 A2 plus the What's new and replies badge defined here | P1 | S |
| SUP19 Grounded assistant | — (T-288) | missing | — | Answers only from published FAQs, release notes and known issues, cites them, never reads tenant records; "Didn't help" offers Suggest a question / Contact support (doc 03 E6) | P2 | L |
| SUP20 Help usage signals | — (T-288) | missing | — | "Was this helpful?" per FAQ; anonymised zero-result searches per module feed the Suggestions tab and the staff themes board | P2 | S |
| SUP21 Satisfaction pulse | — | missing | — | One-tap thumbs up / down on completion, optional comment; shown in staff insights, not to other tenants | P2 | S |
| SUP22 Service levels by priority | §3.31 (priority Low / Normal / High / Urgent) | partial | `SupportPage.tsx` explains priorities in the dropdown | First-response and update targets per priority, shown on the request; Urgent = vessel operations affected, pages STORM on-call and bypasses the helpdesk tier; misuse visible to staff (one reference "Urgent" was a form build, T-15) | P1 | S |
| SUP23 Support insights for account admins | — | missing | — | Open by whose move, median time to first response and to complete, by theme and module, quotes awaiting approval | P2 | S |
| SUP24 Training / demo vessel | §10.3 (test incident left on the demo vessel, cannot be deleted) | missing | — | Vessel flag `is_training`: excluded from fleet KPIs, reports, notifications to the company and billing counts; records on it can be hard-deleted by admins; "Practice mode" banner | P1 | M |
| SUP25 Known-gap decision register | §10.1–10.3 | n/a | this doc, Workflow 9 | Every §10 item has a STORM decision and an owning doc | P0 | S |

### A.4 Ticket → owning spec index (for implementers looking up a ticket)

| Theme | Tickets | Owning spec ids |
|---|---|---|
| A | T-9, 31, 53, 77, 125, 135, 139, 159, 160, 185, 190, 245, 248, 326 | doc 04 C24–C35, W4; doc 01 F35; doc 07 RV5 (T-248) |
| B | T-45, 141, 145, 157, 187, 191, 213, 215, 222, 275 | doc 04 C32 |
| C | T-120, 278, 282, 313, 325 | doc 03 B7; doc 01 W2 |
| D | T-40, 51, 138, 146, 147 | doc 01 F30, F34, F35, F40, F44; doc 02 FC8 |
| E | T-26, 39, 72, 96, 121, 133 | doc 04 C58; doc 01 (transfer capability) |
| F | T-142, 143, 144, 148, 211, 286, 292 | doc 04 C40–C45, W6; doc 02 R9; doc 07 RV7 |
| G | T-20, 27, 52, 71, 228, 306, 316 | doc 04 C47–C56; doc 07 V23, V24 |
| H | T-32, 302 | doc 04 C68–C69; doc 02 V4–V5; doc 07 G6; doc 01 F24 |
| I | T-7, 149, 200, 201, 202 | doc 02 TR5–TR7 |
| J | T-8 | doc 02 M2–M3 |
| K | T-42, 69, 78, 97, 153, 287 | doc 05 INC7–INC11, MED1–MED7, OBS1–OBS2, FRM3, SET4; doc 08 CO1–CO10, TH1–TH5; doc 07 RV13 |
| L | T-25, 74, 131, 150, 314 | doc 05 FRM3, FRM9, FRM11, FRM13, FRM14, HES7; doc 08 REG3, SIG15, TH5 |
| M | T-38, 100, 101, 103, 111, 151, 242, 289, 294, 301 | doc 05 PTW1–PTW10; doc 02 FC7 |
| N | T-33, 34 | doc 05 RA7–RA8; doc 08 CO3 |
| O | T-43, 44, 261 | doc 05 DRL4–DRL10 |
| P | T-70, 290 | doc 05 HES1–HES7 |
| Q | T-2, 3, 5, 6, 13, 15, 16, 18, 22, 24, 28, 29, 73, 112, 122, 134, 165, 174, 226, 254, 258 | doc 02 FC1–FC8; doc 05 OTH1–OTH3, EMG2–EMG3 (T-5, T-6) |
| R | T-4, 80, 132, 285 | doc 05 document change request, OTH3; doc 02 FD11 and fleet documents rows |
| S | T-11, 19, 23, 41, 49, 50, 232, 324, 327 | doc 07 V4, V5, V10, V11, V16, VC3, VC4, RV20; doc 02 R16 |
| T | T-10, 12, 14, 21, 136 | doc 01 vessel module settings; doc 03 §G and Account; doc 04 C56 (T-10); doc 07 CAL8 |
| U | T-58, 68, 92, 107, 166, 170 | doc 08 SV5, SV7, UP4; doc 05 OTH5; SUP7 |
| V | T-79, 163, 252 | doc 03 C7, C11; doc 05 FRM14; doc 08 NO3 |
| W | T-268, 288 | doc 03 A2, E1–E6, F5; SUP17–SUP20 |
| X | T-17, 46 | doc 08 UP6; doc 02 FD11 |

---

## Workflows & state machines

### Reference vs STORM: the support process at a glance (§9, §4.13, `image27`)

| Aspect | Reference app (§9, §4.13) | STORM today | STORM target |
|---|---|---|---|
| Entry points | Fleet page "Support Tickets", in-app chat, support form, AI help button | Footer link to `/help/support`; account-menu "Report an issue" panel (broken) | Help (?) popover, account menu, record header, error screen, explanation cards; all create the same request object |
| Who receives it | Always the vendor | Nobody can act (no UPDATE grant, no staff console) | Company helpdesk first for crew; STORM directly for owner / admins and Urgent (Workflow 1) |
| Classification | Category (mostly "General"), priority, vessel (mostly "All vessels") | Category, priority | Request type that routes work, automatic module / vessel / record / build context, staff-set theme and resolution class |
| Status set | Requested, Awaiting approval, Approved, Testing, To be invoiced, Complete, Cancelled; "Testing" meant both "being built" and "please check" | open / in_progress / resolved / closed (never changes) | Doc 03 set (adds In progress) + Helpdesk stage (this doc); "whose move" chip |
| Cost | Vendor sets a USD cost; customer approves; only 20 of 74 approvals visible in the export | — | Doc 03 quote history with approver, waiver for defect fixes; configuration and content work should rarely be quoted because it is self-service |
| Discussion and files | Markdown comments, contributors emailed, attachments by name | — | Doc 03 comments, contributors, private attachments; internal staff notes |
| Delivery of the change | Long write-up pasted into the cost field; preview links; "hard-refresh to see it" | — | Linked known issue / improvement → release notes → requester notified → update banner (Workflows 4–5) |
| Verification | "Testing" with auto-complete if not kept open | — | "Ready to verify" with reminders after 5 and 12 days; "Still not right" reopens (doc 03) |
| Personal data | Names, emails, page URLs and record details pasted into text | Reporter name and email stored on the ticket | Link records, don't copy them; PII guard; time-boxed support access (Workflow 7) |
| Learning loop | None visible; the same themes recur (incident workflow rebuilt three times) | — | Theme tagging, monthly recurring-theme review, "make it self-service" backlog rule (Workflow 6) |
| Help content | Vendor FAQs + Company FAQs; AI help seen as unreliable (T-288) | Hard-coded guides | Doc 03 Help centre + grounded assistant later |

### 1. Request intake and routing (helpdesk tier) — ext. doc 03 workflow 2

Adds one stage **before** doc 03's `requested`. Doc 03's statuses and transitions from `requested` onward are unchanged.

| Status (key) | Label shown | Meaning | Tab |
|---|---|---|---|
| `with_helpdesk` | With your company's helpdesk | A crew member's request, visible to helpdesk members of that account; STORM cannot see it | Open |
| `resolved_internally` | Resolved by your company | Closed by a helpdesk member with a resolution note | Completed |
| (doc 03 set) `requested` … `cancelled` | as doc 03 | With STORM | as doc 03 |

| From → To | Who | Rule / side effect |
|---|---|---|
| (new) → `with_helpdesk` | Any member **without** `support_tickets.triage` or `.view` (i.e. crew) | Only when the account has `internal_triage` on (default on). Exceptions go straight to `requested`: priority Urgent with type `bug`; type `billing`; accounts with no helpdesk member configured |
| (new) → `requested` | Owner, admins, helpdesk members; anyone when the exceptions above apply | As doc 03 |
| `with_helpdesk` → `requested` ("Send to STORM") | Helpdesk member | Optional internal note (not shown to STORM unless ticked); may correct type, priority, vessel and title; records escalated_by / at; submitter notified "Sent to STORM" |
| `with_helpdesk` → `resolved_internally` | Helpdesk member | Resolution note ≥ 10 chars; optional link to what was changed (invite resent, template edited, requirement added); submitter notified |
| `with_helpdesk` → `requested` (automatic) | System | When `auto_escalate_hours` > 0 and no helpdesk comment or action within that many business hours (default 24, account time zone, Mon–Fri) |
| `with_helpdesk` → `cancelled` | Submitter or helpdesk member | Reason required |
| `resolved_internally` → `with_helpdesk` | Submitter | "Still not fixed" within 14 days, comment required |
| Merge (any open status) | Helpdesk member (own account), STORM staff | Duplicate becomes `cancelled` with reason "Duplicate of TKT-…"; its submitter and contributors become contributors of the target |

**Whose move.** `with_helpdesk` → the company. Doc 03 rules apply after escalation. The Fleet Support badge counts helpdesk items plus STORM requests waiting on the company.

**Notifications (new types).** `support_request_internal_created` → helpdesk members of the account (immediate, in-app + email); `support_request_escalated` → STORM queue (immediate) and submitter (in-app); `support_request_resolved_internally` → submitter and contributors (immediate); `support_helpdesk_waiting` → helpdesk members and owner when an item has waited 24 business hours and auto-escalate is off (daily). Emails carry the request title and a link, never the description, when the recipient is an external contributor.

**Delete rules.** As doc 03: tenants cancel, never delete; STORM staff may hard-delete spam (audited).

### 2. Quick report and error capture (SUP6, SUP7)

**Quick report panel** (opens from Help › Report a problem, account menu, record header, error screen):

1. Type chips: Something's broken / How do I… / Sign-in or access / Fix data on a record / Change our setup / Idea. (Billing is on the full form only.)
2. One-line summary (5–150 chars; greeting-only titles rejected) and "What happened?" (15–10,000 chars). Suggestions from FAQs, known issues and the account's open requests appear under the summary as the user types (SUP8).
3. Context chips, all pre-filled and removable by the user: page, vessel, record (`INC-DRA-2026-009`), error id. Build version and browser are always attached (not removable; not personal data).
4. Optional screenshot: "Capture this screen" (client-side capture of the current view) or upload an image ≤ 10 MB. A redaction step lets the user black out regions before sending. The consent line reads that the image may contain personal data visible on screen and will be visible to the people handling the request. Accounts can switch screenshots off (`allow_screenshots`).
5. Send → creates a request (`source = quick`) and routes per Workflow 1. Confirmation shows the reference and where it went ("With your company's helpdesk" or "With STORM").

**Breadcrumbs.** The client keeps the last 20 events in memory: route changes (path template, not query values), named actions (e.g. `permit.sign`), and failed network calls (endpoint name and status only). No field values, no record contents, no tokens. Attached only to the report the user sends.

**Error capture.**

| Step | Rule |
|---|---|
| Capture | `ErrorBoundary.componentDidCatch`, `window.onerror` and unhandled promise rejections call `reportClientError()` |
| Scrub | Message trimmed to 500 chars; emails, phone numbers and long digit runs masked; stack reduced to file:line frames |
| Group | Fingerprint = hash(error name + first three in-app frames + route template); stored per occurrence with build version / sha, browser, account and user ids |
| Rate limit | One occurrence per fingerprint per user per 10 minutes; at most 50 per user per day |
| Show | Fallback screen: "Something went wrong on this page. Your unsaved input is kept." Buttons: **Try again** (re-mount the failed component), **Report this error** (quick panel with the error id), **Go to dashboard** (warns if a form is dirty) |
| Link | Staff link an error group to a known issue; anyone who later hits the same fingerprint sees "We know about this problem" with the workaround |

**Delete rules.** Error occurrences are kept 90 days, groups indefinitely (counts only). Screenshots follow the request's attachment retention (Data model).

### 3. "Ask for a change" to the company's setup (SUP16)

Purpose: the 52 content and configuration tickets (R1 + R2) were requests the fleet's own administrators should handle in-product.

| Step | Who | Rule |
|---|---|---|
| Ask | Any member | Request type `configuration`, target chosen from: form or checklist template, permit type, drill type, risk-assessment library, document type / catalogue entry, position requirement, module or item visibility, notification routing, other. The target item can be picked (e.g. "Bunker Loading Report") so the request is linked to it |
| Route | System | To members holding the edit capability for that target on that vessel (e.g. Forms & Checklists editors for templates, fleet HR for position requirements, owner / admins for module visibility). If nobody holds it, to the helpdesk queue |
| Do it | Capability holder | Makes the change in the normal admin page; resolves the request with "Done" and an automatic link to the changed item and its new version (`resolved_internally`) |
| Decline | Capability holder | Reason required; submitter notified |
| Escalate | Capability holder or helpdesk | Sent to STORM as assisted setup; STORM may quote (doc 03) only if the account's plan does not include the work |

Controlled SMS documents (SOPs, manuals, duties, ERM checklists) are not handled here: "Ask for a change" on such a document opens doc 05's document change request (T-80, T-4), which has its own approval and hard-copy stages.

### 4. Known issues and planned improvements (SUP9)

| Status | Meaning | Who moves it |
|---|---|---|
| `investigating` | Reported, not yet reproduced | STORM staff |
| `confirmed` | Reproduced; workaround published if any; banner shown in affected modules for affected accounts | STORM staff |
| `planned` | Fix or improvement scheduled (no date promised unless entered) | STORM staff |
| `in_progress` | Being built; may carry a preview flag | STORM staff |
| `released` | Shipped in release `vX.Y.Z`; banner removed; linked requests move to Testing / "Ready to verify" (doc 03) | STORM staff (automatic when the release is published) |
| `wont_do` | Closed with a public reason | STORM staff |
| `duplicate` | Points to another known issue; links move across | STORM staff |

Rules: a known issue has a public title and body written for customers (no tenant names, no personal data) and an internal notes field. Visibility is all accounts, or a list of affected accounts. Linking a request makes its submitter and contributors followers; followers get `known_issue_status_changed` on `confirmed`, `planned`, `released` and `wont_do` (immediate, in-app + email). Users can follow from Help › Known issues or from the module banner. Records are never deleted; released items drop off the Known issues list after 90 days and stay searchable.

### 5. Releases, update prompt and preview features (SUP10–SUP12)

**Release record.** Version (semantic), build sha, release date, title, notes per module (Markdown ≤ 20,000 chars, images allowed), linked known issues and improvements, visibility (all accounts, or accounts with a given preview flag). Draft → Published → (optional) Amended (edits keep history). Publishing:

1. Sets every linked known issue to `released`.
2. Sends `release_published` (in-app only, badge on Help) to all members of affected accounts, and `support_request_shipped` (immediate, in-app + email) to requesters and contributors of linked requests: "Your request TKT-2026-0042 is in v2.14 · What changed · Please check it works".
3. Puts the notes on `/help/whats-new`. Each module page shows a small "New" dot on its tab for 14 days after a release that touched it.

**Update prompt.** The build writes `version.json` (version, sha, built_at) and embeds the same values in the bundle. The client checks it on window focus and every 10 minutes. When the deployed sha differs from the running one, a non-blocking banner appears: "A new version of STORM is ready" with **Reload** and **What's new**. If any form on the page is dirty (form drafts, hours-of-rest entry, permit in progress), Reload first saves the draft or asks the user to save; it never discards input. A release can be marked **required** (security fix): the banner then cannot be dismissed, but still never discards input.

**Preview flags.** Flag states: `off` → `preview` (opt-in per account by the owner) → `on` (everyone) → `retired` (code removed). A module shows "Try the new version" only for opted-in accounts; users can switch back during preview. Feedback from inside a preview creates a request linked to the flag. This replaces separate preview sites and lets the fleet test with real data on its own vessels.

### 6. STORM-side triage and the learning loop (SUP13)

1. **Triage within one business day:** staff set theme key (the 24 themes in table A.1, extendable), module, resolution class (content / configuration / access help / defect / integration / capability / how-to), assignee and SLA; merge duplicates; link to a known issue or create one.
2. **Answer how-to requests with a FAQ link.** If no FAQ exists, the answer is written as a draft platform FAQ first and linked; the request is completed with the link.
3. **Recurring-theme rule.** Each month the themes board lists any theme with three or more requests of class content, configuration or access help across all accounts in the last 90 days. Each such theme must get a product improvement (self-service page, better explanation, better default) in the known-issues register, so the same request stops recurring. This is the loop the reference never closed (the incident workflow was rebuilt three times; forms were built one ticket at a time).
4. **Defects:** linked to an error group where one exists; regression test required before `released`.

### 7. Support access grants (SUP14)

| Status | Meaning | Who |
|---|---|---|
| `requested` | Staff asks for access: scope (vessels, modules, record references), reason, duration (≤ 72 h, default 24 h) | STORM staff, from a request |
| `approved` / `active` | Access works only within scope and time; every read is logged | Owner or a member with `support_tickets.access_approve` (default: owner and DPA-flagged admins) |
| `declined` | Reason optional; staff continue with what the request shows | Same approvers |
| `expired` | Time ran out | System |
| `revoked` | Ended early | Approvers, or the staff member |

Without an active grant, staff see only the request, its comments and attachments, account metadata (vessel names, module switches, user count) and error groups. Under a grant, staff read through RLS that checks `support_access_active(company, vessel, module)`; no writes except through the normal UI as an audited impersonation (doc 01) if the grant says "may act". Every access is written to `support_access_log` and shown to the DPA in Data protection › Activity (doc 03 §H). Notifications: `support_access_requested` → approvers (immediate, mandatory); `support_access_granted` / `expired` → staff member and DPA (in-app).

### 8. Help content signals (SUP17–SUP20)

Doc 03 workflow 3 owns FAQ entries and suggestions. This doc adds: "Was this helpful?" (yes / no + optional comment ≤ 500 chars) per FAQ per user per 30 days; searches with zero results are logged per account and module without the user id, and appear as candidate suggestions to FAQ editors (company) and on the staff themes board (platform); FAQs with ≥ 30 % "no" over 20 votes are flagged for review. The assistant (SUP19, P2) answers only from published platform FAQs, the account's Company FAQs, release notes and known issues; every answer cites its sources; it never reads tenant records; when it cannot answer it offers Suggest a question and Contact support pre-filled with the conversation.

### 9. Known-gap decision register (§10)

Each item the reference mapping could not observe becomes a STORM decision. "Owner" is the doc that builds it.

| § | Known gap | STORM decision | Owner |
|---|---|---|---|
| 10.1 | Permit handover between Authorising Officers and permit withdrawal not exercised | Handover: outgoing AO signs "handed over" with time, incoming AO signs "accepted"; the permit stays open and its validity does not change. Withdrawal: AO or Master withdraws with a reason; status Withdrawn; work must stop; a new permit is needed; closure is blocked while isolations are still applied | doc 05 PTW |
| 10.1 | Company status-update post with follow-up date and vessel reply not exercised | Thread entry with optional "needs a reply by" date becomes a tracked request with an owner; reminders daily once overdue; the record cannot close while a request is open | doc 08 TH1–TH5 |
| 10.1 | Six of seven corrective-action types not run end to end | One shared form; type-specific fields defined by STORM (e.g. class condition → class reference and due date; defective critical equipment → equipment link and temporary measures; security defect → restricted visibility) | doc 05 CA1 |
| 10.1 | Company "not approved" / "approved with conditions" on risk assessments; HESS "return to vessel" | One decision control with outcome and comment; conditions require text; not approved and returned both send the record back with the comment visible in the summary (fixes T-34) | doc 08 CO3; doc 05 RA7–RA8 |
| 10.1 | Vessel seal uploaded but never printed | The seal prints beside the Master's signature on the crew list / FAL 5 and on every Master-signed record PDF | doc 08 PDF4 |
| 10.1 | Email look and recipients, server audit storage, hash method, IP / device data not visible | STORM's own templates and recipient rules per notification type; append-only events; SHA-256 content hash over the canonical record (as already done by the ISM forms engine); truncated IP and user agent stored on signatures and events, shown only in the audit view | doc 03 C1–C11; doc 08 AU* |
| 10.1 | Leave approval screen, visitor visit-details step, recruitment vacancy steps 2–3 and candidates not seen | Designed by STORM: leave approvals in HRIS, visit details as step 2 of the visitor flow, recruitment in HRIS (STORM already has `vacancies`, `candidates`) | doc 04 C68; HRIS docs |
| 10.1 | "Report new emergency" not clicked | Initial notification, timed SITREP updates, stand down by the Master, close by the company; an **Exercise** flag lets crews rehearse without alerting the company | doc 05 EMG2–EMG3 |
| 10.1 | Authenticator setup after confirm; ticket cost approve / cancel buttons not pressed | Recovery codes shown once and trusted-device option (doc 01 W9); cost approve / decline per doc 03 workflow 2 | doc 01 W9; doc 03 |
| 10.1 | Compliance pack output, maintenance period detail, purchase-order lines and statuses, supplier and quote forms, damage claims, running a round, job recurrence and running-hours thresholds | Designed by STORM in the owning docs; recurrence = "whichever comes first" of calendar and hours intervals | doc 06 J7, P3, R2; doc 07 CH8 and reports |
| 10.2 | Crew profile edit forms for tabs other than Personal | Designed by STORM per profile tab | doc 04 |
| 10.2 | Checklists for diving, hazardous work, lift-shaft and bunkering permits | Content, not code: shipped as fleet-editable permit-type templates; the fleet's own documents imported with the builder (the reference built these from the fleet's files, T-111, T-289, T-242) | doc 05 PTW2; doc 02 FC7 |
| 10.2 | Content of other SMS templates (Master's review, inspections, toolbox talks, handovers, drill / training report) | STORM standard library authored in the builder; workflow per template configured (signature slots, company step) | doc 05 OTH2–OTH3 |
| 10.2 | Technical readings, technical dashboard, technical form fields, vessel logbook | Readings and overview per doc 06; the vessel logbook is STORM's own logbooks module (`src/modules/logbooks`), kept | doc 06 E5; LOGBOOKS.md |
| 10.2 | "Message <vendor>", account contact edit, join a vessel | "Message support" = the quick report panel (asynchronous, not live chat); account page and join-a-vessel per doc 03 | this doc SUP6; doc 03 Account |
| 10.2 | Employing companies, payroll overview, agreement builder, add-on invoices | HRIS owns employers and payroll (STORM has `crew_contracts`, `payroll_runs`); agreements use the legal module templates; invoices on the Add-ons page | HRIS; doc 03 §F |
| 10.2 | Where vessel "safety subscribers" are managed | A named recipient group per vessel in Notification Management, used by safety notification types | doc 03 §C |
| 10.2 | Full list of 81 notification types | STORM defines its own catalogue per module; no need to match the count | doc 03, doc 08 |
| 10.2 | Forms & Checklists item types and template contents | STORM field types (`ism/forms/constants.ts`, 14 today) plus crew picker, position picker, equipment picker, data-import block, photo, position (lat / long), rating | doc 02 FC3; doc 05 OTH5 |
| 10.2 | Charter APA, guest induction acknowledgement | APA ledger; induction acknowledgement is a signed guest-checklist item | doc 07 CH12 |
| 10.2 | Certificate list for yachts over 500 GT; per-vessel Vessel Settings page | Certificate sections seeded by vessel type and tonnage band; Vessel Settings per doc 03 | doc 06; doc 03 §G |
| 10.3 | Report variants for other vessels; fleet report tabs not re-read | Variants come from vessel profile data (machinery, fuel, tonnage), never per-vessel code | doc 07; doc 02 |
| 10.3 | Rules not visible: medical status, appraisal overall rating, fleet-document overdue / blocked, expiry triggers, registry sync, AIS provider, import formats, nameplate / survey extraction | Every rule is stated in the product (a "why" popover on the status). Defaults: medical status = worst of medical certificate validity, recorded restrictions and open "unfit" case; appraisal overall = mean of section scores rounded to the scale; overdue = due date passed; blocked = nobody eligible to sign on board; expiry triggers per the expiry engine windows; AIS behind a provider interface; imports use published spreadsheet templates with a validation report; any AI extraction is always confirmed by a person | docs 02, 04, 06, 08 |
| 10.3 | Risk-assessment hierarchy of controls: five checkboxes or a text per level | Both: per level a checkbox "applied" and a text field required when ticked | doc 05 RA4 |
| 10.3 | HESS minutes locked after signing or not | Editable until vessel submission, locked after; corrections through an amendment cycle that keeps history and re-collects signatures (fixes T-314) | doc 05 HES7 |
| 10.3 | Count discrepancies (vessels, access flags, positions, visitor categories) | Every list is a data table; counts are computed, never hard-coded; one counted-vessel rule | doc 01; doc 03 improvement 14 |
| 10.3 | Department lists differ by context | One department catalogue with context subsets. STORM repeats the reference's problem today (six different department lists in code, doc 04 C70) and must consolidate | doc 01; doc 04 C70 |
| 10.3 | Few screenshots for later passes | STORM designs those screens with its own design system; no pixel matching | all |
| 10.3 | A test incident left on the demo vessel cannot be deleted | Training / demo vessel flag with hard delete and exclusion from KPIs (SUP24); on real vessels, "Close as raised in error" | this doc SUP24; doc 05 INC10 |

---

## Data model

Doc 03's support model (`support_tickets` extended, `support_request_quotes`, `_comments`, `_events`, `_attachments`, `_contributors`, `_reads`, `faq_*`, `platform_staff`) is the base. This doc adds the columns and tables below, in the same migration series.

| Entity | Key fields | STORM table(s) | Notes |
|---|---|---|---|
| Support request (additions) | `queue` (`helpdesk` / `storm`), `escalated_at`, `escalated_by`, `escalation_note_internal`, `internal_resolution`, `resolved_internally_by`, `record_kind`, `record_ref`, `record_vessel_id`, `error_occurrence_id`, `config_target_kind`, `config_target_id`, `theme_key`, `resolution_class`, `known_issue_id`, `duplicate_of_id`, `first_response_at`, `sla_first_response_due_at`, `sla_next_update_due_at`, `satisfaction` (-1 / 1), `satisfaction_comment`, `build_version`, `build_sha`, `breadcrumbs` jsonb | `support_tickets` (+ columns) | Status CHECK adds `with_helpdesk`, `resolved_internally` to doc 03's set. `theme_key`, `resolution_class`, `known_issue_id` writable only by platform staff. `record_*` is a link; RLS on the record still applies to whoever opens it |
| Account support settings | `company_id` PK, `internal_triage` bool (default true), `auto_escalate_hours` int (default 24; 0 = never), `urgent_bypass` bool (default true), `allow_screenshots` bool (default true), `helpdesk_intro_md` (≤ 2,000), `business_hours` jsonb (time zone, days, start, end), `updated_by`, `updated_at` | NEW `company_support_settings` | Editable by owner / admins with `support_tickets.triage` |
| Client error occurrence | id, `company_id`, `user_id`, `fingerprint`, `message_scrubbed` (≤ 500), `frames` jsonb (≤ 10 frames, file:line), `route_template`, `build_version`, `build_sha`, `browser`, `occurred_at` | NEW `client_error_occurrences` | Insert-only for authenticated (own user, own company); read by platform staff; purge after 90 days |
| Client error group | `fingerprint` PK, `first_seen_at`, `last_seen_at`, `occurrences`, `users_affected`, `accounts_affected`, `last_build`, `status` (`new` / `linked` / `ignored`), `known_issue_id` | NEW `client_error_groups` | Maintained by trigger or nightly job |
| Product theme | `key` PK, `label`, `module_key`, `description`, `is_active` | NEW `product_themes` | Seed with themes A–X of table A.1 |
| Known issue / improvement | id, `kind` (`issue` / `improvement`), `public_title` (≤ 150), `public_body_md` (≤ 10,000), `workaround_md`, `internal_notes`, `status` (Workflow 4), `module_keys` text[], `theme_key`, `affected_company_ids` uuid[] (null = all), `preview_flag_key`, `released_in_version`, `duplicate_of_id`, `created_by`, timestamps | NEW `known_issues` | Public fields readable by members of affected accounts; internal notes staff only |
| Known issue follower | `known_issue_id`, `user_id`, `source` (`request` / `manual`), `created_at` | NEW `known_issue_followers` | Requesters of linked requests are added automatically |
| Release | `version` PK, `build_sha`, `title`, `notes_md`, `module_notes` jsonb (module_key → Markdown), `status` (`draft` / `published` / `amended`), `is_required` bool, `visibility_flag_key`, `published_at`, `published_by` | NEW `releases` | Readable by all authenticated users once published |
| Release item | `release_version`, `known_issue_id` | NEW `release_items` | Drives notifications on publish |
| Release read state | `user_id`, `last_seen_version`, `seen_at` | NEW `user_release_reads` | Drives the Help badge |
| Feature flag | `key` PK, `description`, `module_key`, `state` (`off` / `preview` / `on` / `retired`), `known_issue_id` | NEW `feature_flags` | Staff-managed |
| Account flag opt-in | `company_id`, `flag_key`, `enabled_by`, `enabled_at`, `disabled_at` | NEW `account_feature_flags` | Owner only; audited |
| Support access grant | id, `company_id`, `request_id`, `staff_id`, `scope` jsonb (`vessel_ids`, `module_keys`, `record_refs`, `may_act`), `reason`, `requested_at`, `duration_hours` (≤ 72), `status` (Workflow 7), `approved_by`, `approved_at`, `expires_at`, `revoked_by`, `revoked_at` | NEW `support_access_grants` | `support_access_active(company, vessel, module)` SQL helper used in staff read policies |
| Support access log | id, `grant_id`, `staff_id`, `object_kind`, `object_id`, `action` (`read` / `act`), `at` | NEW `support_access_log` | Append-only; visible to DPA-flagged admins of that account |
| FAQ feedback | id, `faq_id`, `user_id`, `helpful` bool, `comment` (≤ 500), `created_at` | NEW `faq_feedback` | One vote per user per FAQ per 30 days |
| Help search log | id, `company_id`, `module_key`, `query_normalised` (≤ 200), `result_count`, `clicked_faq_id`, `created_at` | NEW `help_search_log` | No user id; purge after 365 days |
| Vessel training flag | `is_training` bool, `training_since` | `vessels` (+ columns) | Excluded from KPIs, fleet reports, company notifications and counted-vessel rule |
| Legacy feedback | — | `feedback_submissions` (migration never applied live) | Retire; do not apply the migration; remove `feedbackStore` writes |

**Storage.** Private bucket `support-attachments` (doc 03) also holds screenshots: path `company_id/request_id/uuid.ext`, signed URLs (10 minutes), retention 180 days after the request completes, then purged (attachment row kept with `removed_at`).

**Notification types added by this doc.** `support_request_internal_created` (immediate, helpdesk), `support_request_escalated` (immediate, STORM + submitter), `support_request_resolved_internally` (immediate, submitter + contributors), `support_helpdesk_waiting` (daily, helpdesk + owner), `support_request_shipped` (immediate, requesters + contributors), `known_issue_status_changed` (immediate, followers), `release_published` (in-app only, all members), `support_access_requested` (immediate, mandatory, approvers), `support_access_granted` and `support_access_expired` (in-app, staff + DPA).

---

## Improvements over the reference

### Top 15 "must not repeat" product lessons

Each lesson is tied to the ticket themes that taught it. They are acceptance criteria for the whole build, not only for this domain.

1. **No record reads "Completed" before its last required signature and the company's close.** The reference showed completed incidents and medical cases with the Master's signature missing, then rebuilt the incident workflow three times (T-69, T-78, T-97, T-153; US$8,550). STORM builds one record envelope with company sign-off and "whose move" (doc 08) and uses it for every SMS form from day one.
2. **The customer authors its own content.** 27 tickets (US$11,390) paid the vendor to type in the fleet's own forms, checklists, permits, drills and risk assessments. STORM's builder, importers and standard library must be good enough that no form ever needs a ticket (themes Q, M, O, X).
3. **Configuration is a setting, never a ticket.** 25 tickets were catalogue entries, position requirements, hiding modules, moving a form between sections, enabling transfers or branding. Every module ships with its admin page and an "Ask for a change" route to the person who can do it (themes A, D, E, T).
4. **Requirement logic is explicit, never matched by name.** Equivalents shown as missing, combined certificates, superseded qualifications and misfiled imports all came from matching by title (T-326, T-159, T-53, T-185, T-215, T-222, T-157). STORM uses a typed catalogue with "satisfies" relations; its own keyword matcher (`requiredDocuments.ts`) must be replaced, not extended.
5. **An edit invalidates an approval, visibly.** Verified documents stayed verified after edits (T-139, T-163); signed forms changed silently (T-131). STORM resets verification on material edits, marks signatures as signed-before-edit, and notifies the verifier or signer.
6. **Integrations never overwrite people and never fail silently.** Deleted certificates came back after a reclassification (T-275); verifications were at risk from re-sync (T-187); the planner import stopped without anyone noticing (T-316). External ids are permanent, deletions are remembered, sync proposes and a person decides, and every integration shows last run and fails loudly.
7. **Every open item shows whose move it is, how long it has waited, and has a chase button.** Forms sat unsubmitted (T-131), a report needed an email to say it was ready (T-74), six quotes sat in "Awaiting approval" at export (theme L, §9).
8. **Every notification opens the exact record and says what happened.** Emails linked to a generic list (T-252) and delivery could not be checked (T-163). STORM deep-links, includes an excerpt, and shows a delivery log to the person and their admin.
9. **Compliance time starts when the requirement starts, and backfill is honest.** Drills scheduled from the day they were added (T-44); rest hours expected before the module was in use. STORM has "applicable from" dates and explicit Completed-with-evidence / Not applicable-with-reason / Overdue choices for the past.
10. **Vessels differ in data, not in code.** One-engine noon reports, unused fuel grades, ship-specific ECDIS makes, crew sizes for bridge-team sign-off (T-324, T-23, T-327, T-245, T-50). STORM keeps a vessel profile (machinery, fuel grades, equipment makes, bridge team) that drives forms and reports.
11. **One person across the fleet, with kinds, moving by controlled transfer.** People had to be re-created or moved by the vendor (T-26, T-72); transfers skipped compliance checks (T-39); occasional workers and shore staff did not fit (T-32, T-302; US$9,900). STORM has one person record, person kinds and a controlled transfer.
12. **Access is right at first sign-in and explainable afterwards.** Ranks that could only print (T-51), access lost overnight (T-138), invites that never arrived (T-120, T-278, T-282). STORM sets access from position at invite, shows invite delivery, and answers "why can't I?" in the product.
13. **Mistakes and errors are recoverable without the vendor.** Drafts could not be deleted (T-25), mistaken applications could not be voided (T-201), signed minutes could not be corrected (T-314), a test incident stayed forever (§10.3), and error pages lost work (T-92). STORM lets authors delete drafts, void with a reason, amend with history, practise on a training vessel, and never loses typed input to an error.
14. **One product, no per-tenant forks.** The reference shipped tenant-gated forms and vessel-specific copies of fleet templates (T-3, T-134, T-22, T-226) and fleet template edits did not reach vessels (T-25). STORM keeps tenant content as data with scope, versions that propagate, and no customer-specific code paths.
15. **Support is not the delivery channel, and tickets carry no personal data.** Proposals and release notes lived inside cost approvals (34 tickets), users were told to hard-refresh (T-289), 109 tickets were "General", 15 had no description, 21 contained email addresses and 10 titles were a crew member's name. STORM ships release notes and an update prompt in the product, structures requests by type with automatic context, links records instead of copying them, and grants time-boxed support access instead.

### Further improvements for the support and help experience

- **Two-tier support by default.** Crew requests go to the company's helpdesk; the company resolves sign-in, access and configuration questions in minutes (R3 and most R2 tickets), and escalates the rest with one click. Urgent operational problems bypass the tier.
- **Report from where the problem is.** Record header, error screen and explanation cards all open the same quick panel with the record and context attached, so requests are reproducible and contain no pasted personal data.
- **Known issues are visible where users work.** A slim banner with the workaround in the affected module replaces repeated "is this broken?" tickets; following an issue replaces "any update?" comments.
- **Changes announce themselves.** Requesters are told when their request ships and asked to verify it; everyone sees What's new; the app tells users when to reload.
- **Try before everyone gets it.** Preview flags let the fleet test new behaviour on its own vessels with real data and give feedback linked to the change.
- **Service levels are explicit.** Each request shows the first-response and next-update targets for its priority, and what "Urgent" means.
- **The aesthetic facelift.** Help and Support follow the admin page pattern in doc 03 improvement 15: a calm popover, a request page with a progress strip ("With your helpdesk → With STORM → Ready to check → Done") and a single primary action, colour reserved for status, and empty states that say what to do next. The quick panel is a right-hand sheet on desktop and a full-height sheet on tablets and phones, usable with gloves (44 px targets) on deck.

---

## Implementation notes

### Build order inside this domain

1. **Fixes with no UI dependency (S each):** company check on the `support_tickets` SELECT policy; remove the false confirmation-email claim (or send it); stop the feedback panel writing to `feedback_submissions` (point it at `support_tickets` with `source = 'quick'` once doc 03's columns exist); gate `/admin/feedback` (SYSTEM-AUDIT H7); define the build version (SUP11 step 1) so every later report carries it.
2. **Doc 03 support core (D1–D8, workflow 2)** with this doc's additional columns and statuses in the **same** migration.
3. **Helpdesk tier** (Workflow 1, `company_support_settings`, notifications) and **Support settings** page.
4. **Quick panel, record links, error capture** (Workflow 2; `client_error_*`).
5. **Platform console** (`/platform/support`, themes board, merge) — needed before the first external tenant.
6. **Known issues, releases, update prompt, What's new** (Workflows 4–5).
7. **Support access grants** (Workflow 7) — before STORM staff look at any tenant's live data.
8. **Help centre and FAQs** (doc 03 E1–E5), then help signals (SUP20), then the assistant (SUP19, P2), then preview flags (SUP12, P2).

The pain themes themselves are built by docs 01–08; use table A.4 to find the owning feature. Recommended sequencing against the tickets: themes K, L, M, N, O (record envelope and SMS) and A, C, D, E, F (people and compliance) first, because they hold the P0 rows and most of the R5 cost; then Q and T (self-service content and configuration), which remove the R1 / R2 classes.

### Files to reuse or extend

- `src/modules/feedback/components/FeedbackPanel.tsx`: keep the slide-in shell, Escape handling and ARIA wiring; replace its store calls with a `useCreateSupportRequest` mutation; add the type chips, context chips, suggestions and screenshot step. `FeedbackResolvedToast.tsx` becomes "Your request has a reply" driven by `support_request_reads`.
- `src/modules/feedback/store/feedbackStore.ts`, `types.ts`, `pages/FeedbackAdmin.tsx`: retire after the panel is repointed (the store uses `as any` because the table is untyped).
- `src/modules/help/pages/SupportPage.tsx`: split into `RequestNewPage` and `MyRequestsPage`; remove the hard-coded vendor email and phone constants (move to a platform settings row); keep its validation messages as a starting point.
- `src/modules/help/pages/HowToGuidesPage.tsx`: convert `GUIDE_CATEGORIES` into seed rows for platform FAQs (category mapping in doc 03 Data model), then replace the page with the data-driven Help centre.
- `src/modules/legal/components/requests/{CommentThread,EventTimeline,AttachmentList,StatusStepper}.tsx`, `src/modules/legal/lib/{requests,markdown,storage}.ts`, `components/documents/{MarkdownEditor,MarkdownView}.tsx`: the request detail, timeline, attachments and Markdown (as doc 03 recommends). `StatusStepper` renders the progress strip.
- `src/shared/components/ErrorBoundary.tsx`: call `reportClientError()` in `componentDidCatch`; replace the fallback with the Report / Try again / Go to dashboard screen. Register `window.onerror` and `unhandledrejection` once in `src/App.tsx`.
- `src/shared/components/layout/SidebarAccountMenu.tsx`: keep "Report an issue" (opens the quick panel); add the Help (?) button and update banner to the header in `DashboardLayout.tsx`.
- `src/modules/notifications/lib/notificationLinks.ts`: replace the keyword-to-list map with a record-reference resolver (doc 03 C11, doc 08 NO3); the same resolver serves `record_ref` links on requests.
- `supabase/functions/send-email/index.ts`: add templates for the new notification types; restrict callers to the service role (doc 03 build order step 1).
- `vite.config.ts`: inject `VITE_APP_VERSION` and `VITE_APP_SHA` (from `package.json` and the git sha) with `define`, and emit `version.json` into `dist/` with a small build plugin. Add a `useVersionCheck()` hook in `src/shared/hooks/`.
- `src/config/sitemap.ts`: point "Support Tickets" at `/fleet/admin/support` and place it in the Administration group (doc 03 A1); `src/routes/index.tsx`: add `/help/*`, `/fleet/admin/support/*`, `/platform/*` and the redirects listed above.
- `src/modules/ism/forms/pages/CreateTemplate.tsx` and `supabase/functions/extract-form-fields`: the base for theme Q; the "Ask for a change" flow links to template versions created here.

### Migration notes

- **Check that migrations reach the live database.** Hand-written migrations are not applied automatically in the current hosting set-up; three never reached production, including feedback and hours of rest (SYSTEM-AUDIT H3, §6.2). Add a release checklist step (compare `supabase/migrations` against the live `schema_migrations`) before any feature in this doc is announced in What's new.
- Do **not** apply `20260228120000_create_feedback_submissions.sql` now; supersede it with a migration that drops nothing live and documents the retirement.
- Extend `support_tickets` rather than creating a parallel table; map old statuses and categories exactly as doc 03 specifies; add `with_helpdesk` and `resolved_internally` to the status CHECK.
- New tables need RLS from the first migration: tenant tables scoped by `company_id` membership; staff reads only through `is_platform_staff()` and, for tenant records, `support_access_active()`; `client_error_occurrences` insert-only for authenticated users (own `user_id`, own `company_id`).
- Regenerate `src/integrations/supabase/types.ts` after each migration (`feedback_submissions` is untyped today, which hid the failure).
- Seed `product_themes` with themes A–X and their module keys.
- Schedule the auto-escalate, SLA and purge jobs with `pg_cron` and confirm they are actually scheduled (four HR sweeper jobs were declared but never scheduled, SYSTEM-AUDIT M8).

### Pitfalls

- Screenshots and descriptions can contain crew personal and medical data. Private bucket, short signed URLs, purge after 180 days, consent line, redaction step, and staff access only via grants.
- Breadcrumbs must never contain typed values, record contents, query strings or tokens.
- The helpdesk tier must not delay safety-critical problems: Urgent `bug` requests bypass it and page STORM.
- The update prompt must never reload a page with unsaved input (hours-of-rest entry, permit in progress, form drafts).
- Rate-limit error reports; a render loop can produce thousands of errors a minute.
- Tenant-specific labels are hard-coded in places (a training category label in `src/modules/development/constants.ts`, branding strings in payslips and help pages); move them to account settings before a second account is onboarded (lesson 14).
- Known-issue and release texts are public to many accounts: never name a tenant, vessel or person in them.
- Theme tags and resolution classes are staff-only fields; hide them from tenant RLS selects to avoid exposing internal judgement.

### Tests

- RLS: a DPA of company A cannot read company B's requests (regression for today's leak); staff cannot read tenant records without an active grant; grants expire on time.
- Workflow 1 transitions, including auto-escalation in business hours and the urgent bypass.
- Error capture: scrubbing masks emails, phone numbers and long digit runs; fingerprints are stable across builds for the same fault; rate limits hold.
- Version check: banner appears on a new sha; Reload with a dirty form saves the draft first.
- Release publish moves linked known issues to `released` and notifies followers and requesters exactly once.

---

## Open questions

1. **Helpdesk tier default.** Recommended: on for every account, crew requests first to the company's helpdesk, auto-escalate after 24 business hours, Urgent bypass. Confirm (this answers doc 03 Open question 2).
2. **What STORM charges for.** Should configuration and content help (assisted setup, migrating a fleet's existing forms, risk assessments and documents) be included in onboarding, sold as a fixed package, or quoted per request through the doc 03 quote flow?
3. **Support access approvers and limits.** Owner and DPA-flagged admins approve; maximum 72 hours; "may act" off by default. Confirm, and decide whether medical modules can ever be in scope of a grant.
4. **Screenshots from crew.** Allow by default with consent and redaction, or off by default for crew and on for admins? Retention of 180 days after completion acceptable?
5. **Known issues visibility.** Show platform-wide known issues to every account (transparent, fewer duplicate requests), or only to affected accounts?
6. **Preview flags.** Who can opt an account in (owner only, or owner and admins)? Can a single vessel be opted in rather than the whole account?
7. **Assistant.** In scope for the first release (P2 as specified) or later? Any constraint on which AI provider may process help queries (no tenant data is sent, but queries may describe incidents)?
8. **External crew-document registry.** Does the fleet want an integration in the first release, and with which provider? If yes, theme B moves from P2 to P1 and needs the rules in table A.1.
9. **Training vessel.** Should every new account get a training vessel automatically, excluded from billing and KPIs?
10. **Service levels.** Confirm first-response targets: Urgent 1 hour (24/7), High 4 business hours, Normal 1 business day, Low 3 business days; and whether they are contractual or indicative.
