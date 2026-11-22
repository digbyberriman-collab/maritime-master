# Cross-cutting engines — gap analysis

> Spec for implementers. It compares the rebuild blueprint (v1.3) of the reference app with STORM as the code stands today, and defines **one reusable design per engine** that every STORM module uses: signatures and ordered sign-off, company sign-off, status-update threads, snapshots, the per-record audit trail, delete rules, save behaviours, notifications (emit contract), the calendar feed, exports, PDF anatomy, uploads, GDPR hooks and add-on entitlements. Requirements are written as STORM requirements in our own words. Blueprint sections are cited as `§n.n`; reference-app support tickets as `T-n` (numbers only, no personal data).
>
> **Relationship to the other gap docs.**
> - `01-foundations-tenancy-roles.md` owns the model these engines stand on: capabilities (`has_capability`), `is_company_actor(user, vessel)`, `vessel_office_holders(vessel, office, at)`, designated vessel roles, `format_reference()`, vessel-scoped routes `/v/:vesselCode/…`, impersonation. If a model rule differs, doc 01 wins.
> - `02-fleet-view-operations.md` owns the **expiry engine** computation (X2) and the Fleet / Vessel **Calendar pages** (C1–C5, `calendar_events`). This doc defines the feed contract those pages and the notification engine consume.
> - `03-fleet-view-administration.md` owns the **notification pipeline internals** (events, fan-out, dispatcher, frequencies, Notification Management), the **Add-ons page** and the **Data protection pages**. This doc defines how every engine *emits* into that pipeline, the engine-owned notification types, and the entitlement check modules call.
> - `05-vessel-safety-sms.md` (and 04, 06) define **which slots, statuses and triggers each record kind has**. This doc owns the **machinery**: tables, RPCs, TypeScript modules and React components. Doc 05's `safety_records`, `safety_record_updates`, `safety_record_snapshots` and `safety_record_transition()` are the safety-module instances of the generic `record_envelopes`, `record_updates`, `record_snapshots` and `record_transition()` defined here (see *Implementation notes › Reconciliation*). On engine contracts (table shapes, RPC names, component APIs) this doc wins; on per-kind business rules the domain doc wins.

---

## Scope

**Blueprint sections read in full**

| § | Topic | Used for |
|---|---|---|
| Exec summary (lines 1–94) | The eight "build once" engines; Company as a workflow actor | Engine list and priorities |
| §7.1 | Notifications: activity feed, bell, email recipients, expiry alert muting | Emit contract, engine notification types |
| §7.2 | Calendar event sources and visibility by category | Calendar feed |
| §7.3, §5.8 | Reports catalogue and report layouts (Export PDF / CSV / Excel, Compliance Pack ZIP) | Export engine |
| §7.4 | Export formats by surface | Export engine |
| §7.5 | File uploads: types, 50 MB, drill evidence types, offline photos, imports | Upload engine |
| §7.6 | Per-record trail, account audit, retention, subject requests, access review, legal privilege notice | Audit trail, GDPR hooks |
| §7.7 | Add-ons and module billing | Entitlement engine |
| §7.9, §8.1–8.11 | Signature store, methods, block contents, order / auto-submit / removal, edits after signing, company sign-off, logo / icon / seal, PDF anatomy, email notification management, delete rules, audit trail | Signature, sign-off, PDF, delete engines |
| §7.10, §7.12, §7.13 | Other global features (impersonation, saved views, assisted pre-fill); save behaviours; vessel count rule | Save engine, audit of impersonation |
| §3.10, §3.22–3.24, §3.33 | Generic SMS form envelope (whose move, follow-up, snapshot, thread, ordered signatures); calendar event; add-on subscription; notification item; GDPR records | Data model |
| §4.4, §4.12, §4.15, §4.18, §5.7 | Fleet calendar, notification feed, add-ons matrix, Fleet GDPR, vessel calendar | Surfaces that consume the engines |
| §6.2 (image47) | Expiry state machine | Expiry interface consumed by calendar and notifications |
| §6.4, §6.5 (image17, image18), §6.6, §6.7, §6.9, §6.10, §6.12, §6.18, §6.21, §6.22, §6.25 | Every workflow that uses "Sign as / Someone else signing? / Pass to / Remove", company acknowledgement, status updates with follow-up dates, auto-submit | Signature, company sign-off and thread state machines |
| §9 | Support ticket activity log as an example of a per-record event trail | Audit trail shape |
| §10.1–10.3 | Unexercised paths (status-update post, Return to vessel, seal on PDF, hash computation, backend email, safety subscribers) | Treated as STORM design decisions below |

**Screenshots viewed:** `image47.png` (§6.2 expiry states: Valid → Expiring90 → Expiring30 → Expired → renewed; Valid → EndorsementDue → EndorsementOverdue; Missing → uploaded), `image17.png` (§6.5 CA states TypeChosen → Open → PlanConfirmed → InReview → SignedSOHOD → SignedMaster → Verified → Closed), `image18.png` (§6.5 CA sequence: Safety Officer/HoD signs, Master slot unlocks, Master signature auto-submits, company notified, acknowledge, sign off and close, company signature still removable).

**Support tickets used** (from the 142-ticket export; themes only): T-5, T-6, T-24, T-33, T-42, T-46, T-50, T-58, T-69, T-74, T-78, T-79, T-92, T-96, T-107, T-120, T-132, T-133, T-139, T-142, T-148, T-153, T-160, T-163, T-200, T-201, T-252, T-268, T-278, T-282, T-286, T-290, T-314.

**STORM paths inspected (code read, not just names)**

- PDF and exports: `src/lib/pdf/{index.ts,pdfTemplate.ts}`, `src/shared/hooks/usePDFExport.ts`, `src/lib/documentExport.ts`, module generators `src/modules/{hris/lib/reviewPdf.ts,hris/lib/reportExports.ts,hris/lib/payroll/payslip.ts,legal/lib/pdf.ts,logbooks/lib/logbookPdf.ts,work-rest/reports/exports.ts,crew/lib/crewListPdf.ts,rotation-planner/lib/pdfExporter.ts}`, `src/modules/new-build/pages/Piping.tsx`, `src/modules/ism/forms/pages/{FormsArchive.tsx,FormExports.tsx}`, `src/modules/incidents/{components/IncidentDetailView.tsx,pages/CAPATracker.tsx,pages/IncidentAnalytics.tsx}`; `package.json` (jspdf 4, jspdf-autotable 5, exceljs 4, xlsx, papaparse, react-dropzone; **no zip library**).
- Uploads: `src/lib/storage/crewDocuments.ts`, every `.upload(` call site (21; e.g. `src/modules/certificates/hooks/useCertificates.ts` ~375–395, `src/modules/incidents/hooks/useIncidents.ts` ~400–425, `src/modules/incidents/hooks/useCorrectiveActions.ts` ~300–325, `src/modules/documents/hooks/useDocuments.ts` ~175–200, `src/modules/crew/pages/admin/DocumentUploadPage.tsx`, `src/modules/legal/{lib/storage.ts,hooks/useLegalAttachments.ts}`, `src/modules/logbooks/hooks/useLogbookAttachments.ts`), client size/type limits (`AddCertificateModal.tsx`, `ReportIncidentModal.tsx`, `useCrewAttachments.ts`, `BrandingSettings.tsx`, `LogbookAttachments.tsx`), bucket migrations (`20260125163105_*` documents, `20260125220549_*` incident-attachments, `20260129131533_*` + `20260610104821_*` crew-travel-documents, `20260214184755_*` development-documents, `20260917110500_*` avatars, `20260919120000_legal_module.sql` legal-attachments + `legal_attachment_path_allowed()`, `20260919200000_*` new-build buckets).
- Signatures: `src/modules/ism/forms/{components/SignaturePad.tsx,components/FieldRenderer.tsx,hooks/useFormSubmissions.ts,pages/FormSubmission.tsx,pages/PendingSignatures.tsx}`, `supabase/migrations/20260919210000_ism_form_workflow.sql` (`form_signatures`, `form_sign_submission`, `form_reject_submission`, `form_signature_requirements`, `form_user_satisfies_signer_role`, `form_submissions_before_write`), `src/modules/logbooks/components/SignatureCell.tsx` + `20260917200100_logbook_meridian_books.sql` (`logbook_signatures`, `logbook_entry_digest`, `logbook_sign_entry`, `logbook_seal_page`), `src/modules/work-rest/{components/SignOffPanel.tsx,services/workRestService.ts}` + `20260501100000_work_rest_module.sql` (`work_rest_signatures`), `src/modules/hris/components/reviews/ReviewSignaturesTab.tsx`, `src/modules/legal/components/forms/SignatureField.tsx`, generated types for `sms_signatures` / `sms_submissions`.
- Edge functions: `supabase/functions/{sign-submission,submit-form,send-email,hr-daily-sweeper}/index.ts`, `supabase/config.toml`; invocation sites (`supabase.functions.invoke` across `src/`).
- Audit: generated types for `audit_logs`, `activity_log`, `permission_audit_log`, `work_rest_audit_log`, `development_audit_log`, `frp_planner_audit_log`, `logbook_entry_audit`, `legal_request_events`, `application_events`, `nb_*_activity`, `admin_action_log`, `compliance_access_log`, `hr_record_access_log`, `hw_record_access_log`, `audit_mode_access_log`; `get_recent_activity()` in `20260130104033_*`; the 32 client `from('audit_logs').insert` call sites (e.g. `src/modules/hris/hooks/*`, `src/modules/certificates/hooks/useCrewCertificates.ts`); `legal_request_events` trigger pattern in `20260919120000_legal_module.sql`.
- Notifications / alerts: `src/shared/components/layout/{NotificationBell.tsx,GlobalHeaderControls.tsx,DashboardLayout.tsx}`, `src/modules/notifications/{lib/notificationLinks.ts,hooks/useNotificationCenter.ts,pages/*}`, `src/modules/notifications-admin/*`, `src/modules/alerts/*`, `alerts` table, `hr_generate_alerts` / `legal_generate_alerts` / `hw_generate_alerts`.
- Calendar: `src/modules/crew/pages/VesselCalendar.tsx`, `src/config/sitemap.ts` (Fleet Calendar → `/itinerary/timeline`), `src/routes/index.tsx` (`/crew/calendar`).
- Save / errors / delete: `src/shared/components/ErrorBoundary.tsx`, `src/shared/components/modals/DeleteConfirmModal.tsx`, `src/modules/hris/pages/PersonalDetailsPage.tsx` (beforeunload), `src/modules/logbooks/pages/LogbookRegistry.tsx` (save status), `src/modules/legal/pages/LegalDocumentEditorPage.tsx`, `src/shared/components/layout/AdaptiveActionBar.tsx`.
- Other: `src/lib/api/**` (0 imports outside itself), `docs/permissions/MASTER-PROMPT.md` §3.8 (`has_entitlement`), `docs/SYSTEM-AUDIT-2026-09-19.md` (H5, H8, H10), columns on `vessels` and `companies` (no logo / icon / seal / time zone on vessels; `companies.client_logo_url` in a public bucket).

### Headline findings from the code

1. **Five unrelated signature implementations, none with the reference's controls.** (a) ISM forms: `form_signatures` + `form_sign_submission()` — the best one: server-side identity, ordered slots, signing cycles, append-only — but signer eligibility is by role name on any vessel, there is no witness, no "on behalf", no pass-to, no removal, no company slot, and drawn images are stored inline as base64 text (up to 200,000 chars per row) and selected with `signatures:form_signatures(*)` in list queries. (b) Logbooks: `logbook_signatures` with a sha256 `digest`, `entry_version` (optimistic concurrency) and an `attested` (witness) kind — the right integrity model, but bespoke. (c) Hours of rest: `work_rest_signatures` inserted from the browser; RLS checks `signer_id = auth.uid()` but `signer_role` ('captain', 'hod'…) is chosen by the client and never checked. (d) HRIS reviews: timestamps on the review row. (e) Legal forms: typed name + acknowledgement + optional drawing kept in submission JSON. There is **no stored one-tap signature** anywhere.
2. **Two dead, unsafe edge functions** target a legacy `sms_*` schema: `sign-submission` reads a table that does not exist (`sms_required_signers`) and a column that does not exist (`profiles.signature_pin_hash`), and accepts any PIN ("just check it exists"); `submit-form` computes its "content hash" with a 32-bit JavaScript string hash. Neither is called from `src/`.
3. **No company actor, status thread, whose-move, follow-up date or snapshot engine exists in any module** (doc 05 finding 5 confirms for safety). `form_submissions` stops at `SIGNED`.
4. **Audit trail is fragmented and forgeable.** About fifteen audit-like tables. The general one, `audit_logs`, has no `company_id` and is written by **32 client-side `insert` calls** (skippable and forgeable). `activity_log` has **no writers at all**, and `get_recent_activity(p_company_id, …)` is `SECURITY DEFINER` and trusts the caller-supplied company id without a membership check. The only trigger-written, immutable trail is `legal_request_events` — the pattern to copy.
5. **PDF anatomy is a stub.** `src/lib/pdf/pdfTemplate.ts` prints the word "STORM", prints the literal text "[Client Logo]" instead of the logo, has no vessel line (name / flag / IMO), stamps "Page N" at page creation (no total), a date with no time or zone, and "Powered by Inkfish". Only 6 generators use it; 5 bypass it. No signature blocks with images, no hashes, no seal. `FormsArchive.handleExportPDF` shows "PDF downloaded" after one second **without producing a file** (fake success); incident PDF, CAPA and analytics exports are "coming soon". No ZIP capability, so no Compliance Pack or "Download all". Exports are not logged.
6. **Uploads: no shared engine and real defects.** Client limits range 2 / 5 / 10 / 25 / 50 MB; accepted types differ per page; HEIC is accepted almost nowhere. The main `documents` bucket allows 25 MB and only PDF, DOCX, XLSX, PNG, JPEG (blueprint: 50 MB including HEIC, WebP, DOC, XLS). **Certificates, incidents, CAPA evidence and the document library persist `getPublicUrl()` of private buckets**, which produces links that cannot open (matches the "only the file name appears" complaint, T-107). The `incident-attachments` bucket lets any authenticated user of any tenant read, upload and delete, with no company prefix in the path; `development-documents` lets any authenticated user read. The correct pattern already exists in `src/lib/storage/crewDocuments.ts` (company-prefixed path, store the path, signed URL) and `legal_attachment_path_allowed()`.
7. **Notifications are configured, not delivered** (as doc 03 records). The bell reads `alerts` only. `send-email` runs with `verify_jwt = false`, **does not authenticate the caller**, accepts caller-supplied `from` and `cc`, and substitutes variables into HTML **without escaping** — an open relay for phishing from STORM's sending domain.
8. **No calendar engine**: no `calendar_events` table, no feed, no ICS. `VesselCalendar.tsx` reads three sources for one vessel; the Fleet Calendar nav item opens the itinerary Gantt.
9. **No add-on or entitlement implementation.** The permission standard has a `has_entitlement(account, …)` hook, but it is account-level and add-ons are per vessel.
10. **No shared save primitives.** One page has an unsaved-changes guard; the error boundary only offers reload, so a crash loses work (T-92). Vessels and profiles have no time-zone column, so nothing can print local time correctly.
11. **No central delete rules.** Each table's RLS decides; doc 05 records that any company member can delete any incident. 41 modules hand-roll `AlertDialog` confirmations; the shared `DeleteConfirmModal` has 2 users.
12. **Dead layer:** `src/lib/api/**` (users, vessels, flights, alerts, incidents hooks) has zero importers.

---

## Target information architecture

The engines are mostly infrastructure. Their user-facing surfaces are listed here so routes are reserved consistently; page layout of admin pages is owned by doc 03.

### Global (top bar, both views)

```
Bell ▸ inbox popover (unread, mark read, "Needs attention" tab)        doc 03 C9 — engine: notifications
User menu
 ├─ My signature            /me/signature             draw / replace / remove one-tap signature (engine: signatures)
 ├─ My notifications        /me/notifications         in-app + email toggles per type (doc 03 C10)
 ├─ My exports              /me/exports               STORM addition: exports I generated in the last 7 days, status, re-download while the link is valid
 └─ My calendar feed        /me/calendar-feed         STORM addition: personal ICS subscription URL, scope, rotate / revoke
```

### Fleet view (`/fleet/…`)

```
Calendar                    /fleet/calendar?view=list|month|week&vessels=&cats=&attention=1      doc 02 C1–C5 — engine: calendar feed
Safety › Awaiting company   /fleet/safety/inbox?kind=&vessel=&state=awaiting|follow_up_due|stalled  doc 05 — engine: company sign-off queue
Administration
 ├─ Notifications           /fleet/admin/notifications/:tab (activity | email | log)               doc 03
 ├─ Add-ons                 /fleet/admin/addons                                                    doc 03 — engine: entitlements
 ├─ Data protection         /fleet/admin/data-protection/:tab (activity | access | retention | requests | data-held | overview)   doc 03 — engine: audit + GDPR hooks
 ├─ Audit trail             /fleet/admin/audit?module=&vessel=&actor=&kind=&from=&to=              STORM addition (P2): search record_events across modules; owner, admins with reach, DPA
 └─ Exports log             /fleet/admin/exports                                                    STORM addition (P1): every export (who, what, when, contains personal data, downloads)
```

### Vessel view (`/v/:vesselCode/…`)

```
Calendar                    /v/:code/calendar?view=…            same feed, one vessel, + Add event
Vessel › Record › Details   /v/:code/vessel/record/details#branding   Vessel logo · Vessel icon · Vessel seal cards (engine: uploads + PDF)
Reports                     /v/:code/reports/:slug              every report page uses the export engine (Export PDF / CSV / Excel)
Reports › Compliance pack   /v/:code/reports/compliance-pack    server-built ZIP (engine: exports)
```

### Standard record page (every module, every record kind)

Every record that moves through statuses, collects signatures or goes to the company is rendered inside one shell, so URLs and panels behave the same in Safety, Technical, Crew, Vessel and HR:

```
/v/:code/<module>/<kind>/:id                         record (RecordShell)
   ?panel=signatures|updates|activity|attachments|linked     opens that right-rail panel (deep-linkable from emails)
   ?version=<n>                                       read-only snapshot n ("View as submitted" = 1)
   ?cycle=<n>                                         signatures of review cycle n
/v/:code/<module>/<kind>/:id/print                    print-optimised HTML (same blocks as the PDF)
```

Shell anatomy (left to right, top to bottom):
1. **Header**: reference (e.g. `CA-2026-014`), title, status chip, **whose move** chip ("Waiting on vessel" / "Waiting on company" / "Closed"), last update, **follow-up due** (red when past), age, vessel badge, "Acknowledged by the company — <name>, <date time zone>" line when set.
2. **Banners** (stacked, at most two visible): order banner ("Waiting for the Master's signature — sign in order"), stale-signature banner, review-in-progress banner, voided banner, legal-privilege banner (incident kinds), read-only reason.
3. **Body**: domain sections with a left outline and completion meter (domain-owned content).
4. **Sticky action bar** (never covered by toasts or pop-overs, T-58): Save status ("Saved 14:02 by you") · Save draft · primary transition (Submit / Submit to company / Confirm …) · Export ▾ · ⋯ (Delete or Void per policy, Copy, Initiate review).
5. **Right rail tabs**: Signatures · Updates (thread) · Activity (audit trail) · Attachments · Linked records.

---

## Feature inventory

Status legend: complete / partial / placeholder / missing (see task definitions). Priority P0–P2, effort S–XL.

### A. Record registry (foundation for every engine)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| REG1 One registry of record kinds: key, module, label, reference prefix, route builder, status vocabulary, signature slot template, company sign-off required, edit-after-sign policy, delete rule, snapshot triggers, PDF template key, notification type keys, calendar source, personal-data extractor, sensitive field list | Exec summary engines; §3.10 | missing | Knowledge is scattered: `ism/forms/constants.ts`, `notifications/lib/notificationLinks.ts` keyword map, per-module PDF files | `src/lib/records/registry.ts` (TS, typed) + `record_kinds` table seeded from it by migration; SQL reads policy from the table, UI from the TS registry | P0 | M |
| REG2 Polymorphic record envelope: company, vessel, module, kind, entity id, reference, status, whose move, follow-up due, last update, company acknowledgement, decision, closed-as, current cycle, digest, version, voided fields | §3.10 | missing | `form_submissions` has number / status / hash / cycle for template forms only | `record_envelopes` (one row per workflow record of any module; domain tables keep their content and FK to the envelope) | P0 | L |
| REG3 Single server-side transition function per envelope with guards, actor stamping and event writing | §6.4–6.10, T-78 | partial | `form_submissions_before_write()` guards ISM statuses; everywhere else the client updates `status` | `record_transition(envelope_id, action, payload)` dispatching to per-kind guard functions; client names only the action | P0 | L |

### B. Signatures and ordered sign-off (§8.1–8.5, §8.11)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| SIG1 One-tap signature store ("My signature"): draw once, replace, remove; first signing attempt opens a set-up dialog that saves it | §8.1 | missing | — (sign-submission reads a non-existent `profiles.signature_pin_hash`) | `user_signature_images` + private bucket `signatures` + `/me/signature` + `SignatureSetupDialog`; drawn only (no typed, no upload) | P0 | M |
| SIG2 Crew-profile signature shown on the profile | §8.1 | missing | — | STORM decision: **one** store (the profile shows the same image) instead of two independent stores; onboarding progress item "signature" reads it | P1 | S |
| SIG3 Signature slots per record (label, order, party vessel/company, office or named people, required, sections covered, on-sign trigger, allow witnessed, allow on-behalf) | §8.4, §6.4–6.10, T-50 | partial | `form_templates.required_signers` + `form_signature_requirements()`; fixed roles in work-rest; logbook policies | `record_signature_slots` instantiated from the registry or the template when the envelope is created (and per review cycle); template editor can add slots (e.g. 5-signature passage plan, T-50) | P0 | L |
| SIG4 Order enforced; later slots show "Awaiting earlier signature"; banner names the role being waited on; parallel groups allowed | §8.4 | partial | `form_sign_submission()` enforces order unless `allow_parallel_signing` | Generic `sign_slot()`; slots sharing an `order_no` sign in parallel; `OrderBanner` | P0 | M |
| SIG5 Sign as <me> (Verified, own account, stored image) | §8.2 | partial | ISM `SignaturePad` (typed or drawn each time); work-rest "Sign as crew" button | Uses stored image; records method `verified`, rank/role at signing, record digest; one tap after set-up | P0 | M |
| SIG6 Someone else signing? → "Who is signing?" (me / search crew by name or position / crew list with ranks / visitor or contractor) → witnessed pad drawn on this device; witness = the logged-in user | §8.2 | missing | logbook `attested` kind (witness name + capacity) is the nearest | `SignCeremonyDialog` + `WitnessPad`; method `witnessed`; crew picked → `signer_profile_id` set; visitor → typed name + company + capacity | P0 | M |
| SIG7 Pass to <person> (primary button when the current user is not eligible or not on this vessel's crew list) | §8.2, §6.7 | missing | — | `pass_slot_to()` creates a sign request: inbox item + email with deep link `?panel=signatures`; slot shows "Passed to <name> · 2 h ago · Remind · Cancel" | P0 | S |
| SIG8 Signed on the Master's behalf (record's Master name unchanged) | §8.2, §6.10 | missing | — | Method `on_behalf` + `on_behalf_of_office`; only on slots with `allow_on_behalf`; reason optional | P1 | S |
| SIG9 Signature block: image box · bold name + coloured method badge · rank/role · date and time **with zone** · italic method line · Remove (right) | §8.3 | partial | ISM read-only card (name, `toLocaleString`, role badge, image); `SignatureCell` (logbooks) | `SignatureBlock` used on screen and mirrored by the PDF block; badges Verified (green), Witnessed (amber), On behalf (blue); zone label added (the reference shows none) | P0 | S |
| SIG10 Remove signature: reverse order only; the company decision goes first; reason required once submitted | §8.4 | missing | `form_signatures` cannot be removed | `remove_signature()`; only the latest non-removed signature of the cycle; signer, Master (vessel slots) or company actor (company slot; vessel slots only after Return to vessel); status recomputed | P0 | M |
| SIG11 On-sign triggers (auto-submit to company, set status, save record, set Master's name on voyage reports) | §8.4, §6.5, §6.6, §6.10 | partial | `form_sign_submission()` sets `SIGNED` when the last mandatory slot is signed | `on_sign` action on the slot, executed in the same transaction as the signature | P0 | S |
| SIG12 Stale signature flag after edits ("signed before later edits") and policy per kind: allow-with-flag, lock, revert-to-draft | §8.5 | partial | Logbooks: digest + `entry_version`; ISM: content locked once pending signature | Digest per slot over the sections it covers; recomputed on every save; `StaleSignatureBanner` with one-tap **Re-sign**; stale required signatures block submit-to-company and close (STORM rule, stricter than the reference) | P0 | M |
| SIG13 Review cycles: Initiate review → sections show "Sign for this review" → re-approve; previous signatures kept as history | §8.5 | partial | `signing_cycle` on `form_submissions` / `form_signatures`; `AMENDED` status | Generic cycles on the envelope; history visible via `?cycle=n`; PDF prints the current cycle and "Review n of …" | P1 | M |
| SIG14 Revert to draft (voyage reports): clears signatures of the current cycle | §8.5, §6.10 | missing | — | Policy `revert_to_draft`; signatures marked superseded, not deleted | P1 | S |
| SIG15 Remind a pending signer; reminders shown in the trail ("Reminded by … on …") | §7.6, T-133, T-148, T-286 | missing | — | `remind_slot()`; at most one reminder per person per slot per 24 h; logged | P1 | S |
| SIG16 Tamper evidence on every signature: record digest at signing, image hash, integrity hash; printed on PDFs | §8.8, §8.11 | partial | `form_submissions.content_hash` (sha256 of `form_data`); logbook `digest`; `submit-form` 32-bit hash (dead) | `record_digest`, `image_sha256`, `integrity_hash = sha256(record_digest ‖ slot_id ‖ signer ‖ signed_at ‖ image_sha256)` computed in SQL | P1 | S |
| SIG17 Server-side eligibility: office holder of **this** vessel at signing time, capability `sign` on the module, separation of duties (e.g. AO ≠ CP ≠ creator) | §8.6, doc 01 F33 | partial | `form_user_satisfies_signer_role()` matches role name on any vessel; work-rest trusts the client's `signer_role` | `slot_eligible(slot, user)` using `vessel_office_holders()` + `has_capability()` + per-kind SoD list from the registry | P0 | M |
| SIG18 Consolidate legacy stores; retire dead code | — | partial | `form_signatures`, `sms_signatures`, `work_rest_signatures`, `logbook_signatures`, HRIS review columns, legal JSON; `supabase/functions/sign-submission`, `submit-form` | Migrate to `record_signatures` (compatibility views keep old readers working); delete the two edge functions and their `config.toml` entries | P1 | L |

### C. Company sign-off (§8.6)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| CO1 Company actor gate (owner, or admin whose reach includes the vessel), enforced in the database; UI explains why controls are absent | §8.6, T-78 | missing | Ad hoc role checks per module | `company_action()` RPC calls `is_company_actor()` (doc 01) before anything else | P0 | S |
| CO2 Acknowledge on behalf of the company (who, when; header line) | §8.6, §6.4, §6.5 | missing | — | Action `acknowledge` | P0 | S |
| CO3 Decision in **one** action: Approved / Approved with conditions (conditions required) / Not approved (reason required) + comment | §8.6, §6.9, T-33 | missing | — | `CompanyDecisionPanel`: choice, comment, confirm in one dialog; no save-draft round trip | P0 | S |
| CO4 Sign off and close | §8.6 | missing | — | Action `sign_off` → closed + snapshot + notifications | P0 | S |
| CO5 Return to vessel (reason; current vessel signatures superseded; whose move = vessel) | §8.6, §6.6 | missing | `form_reject_submission()` is a vessel-side rejection | Action `return` → `info_requested` | P0 | S |
| CO6 Close as (closed after review / raised in error / duplicate of <ref>) with root cause saved against the closer and locked | §6.4 | missing | — | Action `close` with `closed_as`, `duplicate_of_envelope_id`, root cause immutable after save | P0 | S |
| CO7 Reopen (reason) → new cycle; next close gets a new closed version | §6.4 | missing | — | Action `reopen` | P1 | S |
| CO8 Remove company signature / decision (reason) | §8.4, §8.6 | missing | — | Action `remove_company_signature` | P1 | S |
| CO9 Company queue across vessels (awaiting acknowledgement, awaiting sign-off, follow-ups due, stalled) | §8.6, §8.9 | missing | — | `company_queue(filters)` RPC used by doc 05's fleet Safety inbox and doc 02's dashboard tiles | P0 | M |
| CO10 Company step configurable per template (required / not required / acknowledgement only) | T-74, T-78 | partial | `form_templates` has no company flag | Registry / template field `company_step ∈ {none, acknowledge, sign_off}` | P1 | S |

### D. Status-update threads (exec summary engine 3; §3.10, §6.4)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| TH1 Thread per record: company update (optional follow-up date), company request (due date), vessel reply, system entries (status, signatures, reminders, nudges) | §3.10, §6.4, T-153 | missing | Nearest: `legal_request_comments` (typed comments); `incident_investigation.timeline` jsonb | `record_updates` + `StatusThread` component | P0 | M |
| TH2 Request lifecycle: Reply (vessel) / Mark done / Change date (reason) / Cancel (company); closing blocked while a request is open | §6.4 | missing | — | `request_state ∈ {open, done, cancelled}` + `resolve_status_request()` | P0 | M |
| TH3 Whose move, last update, follow-up due and age computed on the envelope; shown on headers and every list | §3.10 | missing | — | Trigger on `record_updates` / transitions maintains envelope columns | P0 | S |
| TH4 Thread entries notify vessel subscribers and company recipients with a short excerpt and a deep link | §7.1, §8.9, T-252 | missing | `send-email` unused | Emit `record_update_posted` (batched 15 min); excerpt omitted for sensitive kinds | P0 | S |
| TH5 Follow-up due / overdue reminders; nudge after 2 days waiting on the vessel (doc 05 rule) | §6.4, T-148 | missing | — | Daily job emits `status_request_due` / `status_request_overdue`; `nudge` action | P1 | S |
| TH6 @mentions and attachments on thread entries | — (STORM) | missing | — | Mention picker limited to people who can read the record; attachments via the upload engine | P2 | S |

### E. Snapshots and versions (§6.4, §8.8, §8.11)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| SN1 Snapshot on submit ("View as submitted"), close, reopen, sign-off, review start | §6.4, §8.11 | partial | `form_submissions.content_hash` only | `record_snapshots` (full JSON of envelope + domain row + children + signatures, sha256) + `SnapshotViewer` at `?version=n` | P0 | S |
| SN2 Closed review version id printed on the PDF | §8.8 | missing | — | `<reference>-v<seq>-<first 8 of sha256>` | P1 | S |
| SN3 Compare two versions (field diff) | T-314 (STORM) | missing | — | `VersionDiff` view from two snapshots | P2 | M |

### F. Per-record audit trail (§7.6, §8.11)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| AU1 Activity timeline per record: created / started by, submitted by, reviewed by … on …, acknowledged by the company, reminders, signatures, status changes, field changes, exports, attachments | §7.6, §8.11, §9 | partial | ~15 module-specific logs; `audit_logs` (client inserts); `legal_request_events` (trigger-written) | `record_events` written only by triggers and engine RPCs; `ActivityTimeline` component | P0 | M |
| AU2 Append-only and tamper-resistant: no client INSERT / UPDATE / DELETE; company-scoped read | §7.6 | partial | `audit_logs` has no `company_id`, 32 client insert sites; `permission_audit_log` `WITH CHECK (true)` (doc 01) | Definer-only inserts; revoke UPDATE/DELETE from all roles; migrate the 32 callers to triggers on the audited tables | P0 | M |
| AU3 Account data-protection activity (exports, legal holds, permission changes, users created/removed, bank detail changes; 365 days) | §4.18, §7.6 | missing | — | Doc 03 `data_protection_events`; fed from `record_events` and `export_jobs` triggers here | P0 | M |
| AU4 Fleet recent-activity feed | §4.12 | placeholder | `activity_log` (no writers); `get_recent_activity()` (definer, trusts caller's company id) | Replace with doc 03 `notification_events` feed; drop or fix `get_recent_activity` (membership check) now | P1 | S |
| AU5 Impersonation recorded on every event ("by X, acting as Y") | §7.10, doc 01 | missing | — | `impersonator_user_id` on `record_events`, `record_signatures`; signing while impersonating is **refused** | P1 | S |
| AU6 Request metadata (truncated IP, user agent, app version) on signatures and events; not shown in record UI, visible in the audit view to DPA / owner | §8.3, §10.1 | partial | `work_rest_signatures` (client-supplied UA), `sms_signatures` | Captured server-side from request headers in the RPC | P2 | S |
| AU7 Sensitive fields masked in diffs, emails and exports (medical, pay, passport, bank) | §7.6 | missing | — | Registry `sensitive_fields`; diff writer stores "changed" without values unless the reader has T3 access | P0 | S |

### G. Delete rules (§8.10)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| DEL1 Central delete policy per record kind, enforced in SQL and reflected in the UI | §8.10 | missing | Per-table RLS; incidents deletable by any member (doc 05) | `record_kinds.delete_rule` + `can_delete_record()` used by RLS DELETE policies and by `DeleteRecordButton` | P0 | M |
| DEL2 Void instead of delete once a record is submitted, signed or shared: reason required, record retained, hidden from registers by default, visible to auditors, shown as "Voided" | §8.10 (STORM improvement) | missing | 15 ad hoc `archived_at` / `deleted_at` columns | `voided_at`, `voided_by`, `void_reason` on the envelope; `void_record()` | P0 | S |
| DEL3 Submitted incidents never deletable (reopen instead) | §8.10 | missing | RLS allows delete | Rule `never_after_submit` | P0 | S |
| DEL4 Deleting every voyage report removes the voyage | §8.10 | missing | — | Voyage domain cascade on top of DEL1 | P2 | S |
| DEL5 One confirmation pattern (kind + reference in the title, consequence sentence, "Delete permanently" / "Void record"; typed confirmation for bulk) | §8.10 | partial | `DeleteConfirmModal` (2 users); 41 modules with bespoke `AlertDialog` | Extend `DeleteConfirmModal` → `ConfirmDestructiveDialog`; migrate gradually | P2 | S |
| DEL6 Legal hold blocks delete, void and retention purge | §7.6 | missing | — | Check `crew_legal_holds` (doc 03) and record-level hold flag in `can_delete_record()` | P1 | S |

### H. Notifications — emit contract (§7.1, §8.9; pipeline in doc 03)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| NO1 Every engine action emits exactly one event via `emit_notification_event()` inside its transaction (outbox) | §7.1 | missing | — | Calls from `sign_slot`, `pass_slot_to`, `remind_slot`, `company_action`, `post_record_update`, `record_transition`, export completion, entitlement changes | P0 | M |
| NO2 Engine-owned notification types seeded (see *Workflows § N*) with defaults and audiences | §8.9 | missing | `notification_types` (~38 rows, no engine types) | Seed rows; "no recipients" warning for company types (reference showed one with none) | P0 | S |
| NO3 Deep link to the exact record and panel in the right vessel (`/v/dra/safety/corrective-actions/<id>?panel=signatures`) | T-252 | partial | `notificationLinks.ts` maps keywords to list pages | `recordLink(kind, id, vesselCode, panel)` from the registry; stored on the event | P0 | S |
| NO4 Safe email transport: service-role callers only, escaped variables, fixed From, no caller `cc` | — | partial (unsafe) | `send-email/index.ts` (`verify_jwt = false`, no caller check, caller `from`/`cc`, unescaped substitution) | Lock down now (S), then route all sends through doc 03's dispatcher | P0 | S |
| NO5 Expiry alert muting per item ("alerts off") and HoD "silence expiry alerts"; only officers / management may mute | §7.1, §6.2, T-160 | missing | `alerts` has snooze, no per-item mute | `alerts_muted_at/by/reason` on expiring items; capability `…silence_expiry_alerts`; muted items still appear in reports, greyed | P1 | S |
| NO6 Bell realtime from `user_notifications` (not `alerts` polling every 30 s) | §7.1 | partial | `NotificationBell.tsx` polls `alerts` every 30 s plus a realtime channel on `alerts` | Doc 03 C9 | P1 | M |

### I. Calendar feed (§7.2, §4.4, §5.7, §3.22)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| CAL1 Source registry generating events: certificate / insurance expiry, endorsement windows, drills due + monthly drill reminders, crew embark / disembark, technical jobs due, surveys, charter / trip dates, vessel movements, form schedule due dates, HESS due, permit validity end, training course dates, GDPR request due (DPA only), custom events | §7.2 | partial | `VesselCalendar.tsx` (travel, audits, drills; one vessel) | `calendar_feed(from, to, vessel_ids, categories)` RPC (doc 02 calls it `fleet_calendar_feed`; one function) built from one SQL view per source; TS registry for colour, icon, label | P1 | L |
| CAL2 Category decides visibility (module permission per vessel) | §7.2, §5.7 | missing | — | Feed filters rows by `has_capability(<module>.view, vessel)`; custom events with no category visible to all vessel members | P1 | S |
| CAL3 Status per event (Due soon / Overdue / Completed) and the attention banner "n need attention — x overdue · y due soon — Show these" | §4.4 | missing | — | Computed in the feed from the source's due/completion state and the expiry buckets | P1 | S |
| CAL4 Custom events (Add event) | §5.7, §3.22 | missing | — | `calendar_events` (doc 02) + `EventDialog` | P1 | M |
| CAL5 Export current view (ICS, CSV) | §7.4, §4.4 | missing | — | `src/lib/calendar/ics.ts` (RFC 5545, all-day `VALUE=DATE`, UID = `<source>:<id>@storm`) | P1 | S |
| CAL6 Personal ICS subscription (token URL, scope, rotate / revoke; no personal data beyond what the user can see) | — (STORM) | missing | — | `calendar_subscriptions` + `calendar-ics` edge function | P2 | M |
| CAL7 Performance: 10 vessels × 12 months renders in under 1 s (reference ~10 s) | §4.4 | missing | — | Indexed due-date columns per source; feed paginates by range; cache 60 s | P1 | S |

### J. Exports (§7.3, §7.4, §5.8)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| EX1 One export menu (PDF / CSV / Excel, plus ZIP where defined) with consistent file names | §7.4 | partial | Ad hoc: ExcelJS in `documentExport.ts`, rotation planner xlsx, ~25 hand-rolled CSV writers | `ExportMenu` + `src/lib/export/*`; name pattern `<VESSELCODE>_<Kind>_<ref-or-range>_<yyyy-mm-dd>.<ext>` (fleet: `FLEET_…`) | P0 | M |
| EX2 Record PDF per kind (incident, CA, permit, RA condensed, HESS, voyage reports, technical forms, medical case, certificates register, crew biographies, emergency contacts, SMS summary) | §7.4, §8.8 | partial | 6 modules on the template; incident PDF "coming soon"; `FormsArchive` fake success | Template per kind in `src/lib/pdf/templates/`, registered in the record registry | P0 | L |
| EX3 Server-built bundles (Compliance Pack ZIP with manifest, certificates "Download all", bulk form export) | §7.3, §7.4 | missing | `FormExports.tsx` (honestly disabled); no zip library | `export-builder` edge function + `export_jobs`; progress in `/me/exports` and a toast when ready | P1 | L |
| EX4 Every export logged (who, what, filters, row count, personal data yes/no); personal-data notice on the file | §7.3, §7.6 | missing | — | `export_jobs` row for client-side exports too (`log_export()` RPC before download) | P0 | S |
| EX5 Expiring links: 1 hour for personal-data bundles, 24 hours otherwise; files purged after 7 days | §7.6 | missing | — | Signed URL TTL from kind; purge job | P1 | S |
| EX6 Excel where the reference offers it (certificates, crew documents, vaccinations, hours of rest months) | §5.8 | partial | HRIS CSVs, rotation planner xlsx | Via EX1 (domain docs own columns) | P1 | M |
| EX7 Remove fake export success | — | partial | `src/modules/ism/forms/pages/FormsArchive.tsx` `handleExportPDF` | Wire to EX2 or disable with reason | P0 | S |

### K. PDF anatomy (§8.7, §8.8)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| PDF1 Header: title, vessel logo + company logo (real images), "<Vessel> — Flag: <flag> — IMO: <n>", status / created line, reference | §8.8 | partial | `pdfTemplate.ts` prints "STORM", literal "[Client Logo]", title, "Prepared for" | Images fetched via signed URL and embedded once; vessel line from `vessels`; status line from the envelope | P0 | M |
| PDF2 Footer: "Generated by STORM — <date>, HH:MM UTC" (+ vessel local time where known), "Page N of M" (second pass), reference + content version + revision | §8.8 | partial | "Powered by Inkfish", "Page N" with no total, date without time or zone | `finalizePdf()` stamps footers after content; keeps the Inkfish line if the brand requires it | P0 | S |
| PDF3 Signature block (image, name, badge, rank, time with zone, method line, witness) and company acknowledgement block | §8.8 | partial | `reviewPdf.ts`, `logbookPdf.ts` print text lines only | `pdfSignatureBlock()` mirroring `SignatureBlock` | P0 | M |
| PDF4 Vessel seal printed beside the Master's signature block (crew list / FAL 5, report sign-offs); vessel logo and icon stored | §8.7 | missing | No logo / icon / seal columns on `vessels`; `crewListPdf.ts` prints a blank signature line | `vessels.logo_file_id`, `icon_file_id`, `seal_file_id`; `pdfSealBlock()`; the reference uploads a seal but never prints it | P1 | S |
| PDF5 Content hash + integrity hash on every signed record PDF (the reference prints them on HESS only) | §8.8 | missing | — | `pdfHashFooter()` from the snapshot the PDF was rendered from | P1 | S |
| PDF6 Condensed on-board display copy (RA) stating the controlling record is in STORM | §8.8 | missing | — | Template option `variant: 'condensed'` | P2 | S |
| PDF7 Standard notices: legal privilege (incident kinds), "a digital stamp and date are recorded for the person completing this form", permit statement | §7.6, §8.8 | missing | — | `pdfNotice(kind)` text from registry; same text as on-screen banner | P1 | S |
| PDF8 Size discipline (reference: a 14-page HESS export was over 10 MB) | §8.8 | n/a | — | Signature PNGs downscaled to ≤ 600×240 and ≤ 50 KB; logos ≤ 300 px; images embedded once and reused | P2 | S |
| PDF9 Move bypassing generators onto the shared anatomy | — | partial | `documentExport.ts`, `crewListPdf.ts`, `rotation-planner/lib/pdfExporter.ts`, `new-build/pages/Piping.tsx`, `logbookPdf.ts` (own footer) | Migrate header / footer; keep their bodies | P2 | M |

### L. Uploads (§7.5)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| UP1 One upload engine: types PDF, JPG/JPEG, PNG, WebP, HEIC/HEIF, GIF, DOC/DOCX, XLS/XLSX (+ per-kind additions); ≤ 50 MB; clear rejection messages | §7.5 | partial | `crewDocuments.ts` (good), 21 bespoke `.upload(` sites, limits 2–50 MB | `src/lib/storage/files.ts` + `FileDropzone`; bucket `file_size_limit` and `allowed_mime_types` aligned to 50 MB and the list | P0 | M |
| UP2 Private, tenant-scoped storage: paths `<company>/<vessel or fleet>/<module>/<entity>/<uuid>-<safe-name>`; path-validating policies; store the path, never a URL; signed URLs to read | — | partial | OK: `documents` (company prefix), `legal-attachments`, `crew-travel-documents`. Broken: `incident-attachments` (any tenant reads/writes/deletes, no company prefix), `development-documents` (any tenant reads); certificates, incidents, CAPA, document library store `getPublicUrl()` of private buckets | New policies via `storage_path_allowed(bucket, name)`; data migration from stored URLs to paths (reuse `resolveCrewDocumentPath`) | P0 | M |
| UP3 File metadata (name, type, size, sha256, uploader, time), duplicate warning, versioned uploads where the kind is versioned (certificates, documents) | §7.5, §5.3 | partial | `document_versions` (document library only) | `file_objects` + `record_attachments` with `version_of` | P1 | M |
| UP4 Previews: images (HEIC converted to JPEG preview), PDFs inline, Office files as download | T-107 | partial | `documents/components/PDFViewer.tsx` | `media-normalise` edge function writes a preview + thumbnail; `FilePreview` component | P1 | M |
| UP5 Weak-link resilience: client-side image compression, resumable upload above 6 MB, offline photo queue | §7.5 ("offline-capable" photos) | missing | — | Resumable (TUS) uploads; IndexedDB queue retried on reconnect | P2 | L |
| UP6 Bulk upload / import with per-file progress and optional extraction | §7.5, T-46, T-132 | partial | `crew/pages/admin/DocumentUploadPage.tsx` (extraction), `ImportCrewCSVModal.tsx`, new-build `BulkUpload.tsx` | Multi-file queue in `FileDropzone`; domain import adapters register in the record registry | P1 | M |
| UP7 Malware scanning before a file is downloadable by others | — (STORM) | missing | — | Open question (provider) | P2 | M |

### M. GDPR hooks (§7.6, §6.21; pages in doc 03)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| GD1 Subject export assembled from every module (each record kind declares how to extract one person's data and files) | §6.21, §4.18 | partial | HRIS client-side JSON export (limited by the exporter's RLS) | `personalDataExtractor` per kind; export job kind `gdpr_subject` run server-side | P0 | M |
| GD2 Legal hold respected by delete, void and purge | §7.6 | missing | — | DEL6 | P1 | S |
| GD3 Retention purge across engines (events 365 days in view, deliveries 90 days, export files 7 days, voided records after the kind's retention) | §7.6 | partial | `data_retention_policies`, `hr_archive_due_records()` (HR only) | `purge_expired_engine_data()` nightly; per-kind `retention_years` | P1 | M |
| GD4 Personal-data notices on exports and in the Compliance Pack | §7.3 | missing | — | EX4 | P1 | S |
| GD5 Legal privilege notice on incident forms and PDFs | §7.6 | missing | — | PDF7 + banner | P1 | S |

### N. Add-ons and entitlements (§7.7, §6.22; page in doc 03)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| AD1 Per-vessel entitlement check used by nav, routes, RLS, calendar, notifications and reports | §7.7 | missing | `MASTER-PROMPT.md` §3.8 `has_entitlement(account, …)` (account-level only) | `has_vessel_entitlement(vessel_id, addon_key)` (trial or subscribed) + `useVesselEntitlement()` + `<AddonGate>` | P1 | M |
| AD2 Trial / subscription state machine (90-day trial once per add-on per vessel; owner / admins; changes save immediately) | §6.22, §4.15 | missing | — | Doc 03 F (`vessel_addon_subscriptions`, `set_vessel_addon_state()`) | P1 | M |
| AD3 Trial ending reminders (14 and 3 days) and switched-off behaviour (data kept, read-only, banner) | — (STORM) | missing | — | Daily job + gate behaviour | P1 | S |
| AD4 Billing events export for invoicing | §7.7 | missing | — | `addon_billing_events` (doc 03) + CSV via EX1 | P2 | S |
| AD5 Request an add-on from the vessel in one click; owner/admins notified | §6.22, T-268 | missing | — | Doc 03; `<AddonGate>` shows "Ask an admin" | P2 | S |

### O. Save behaviours (§7.12)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| SV1 Autosave ("changes save as you make them") with a visible save state | §7.12 | partial | `LogbookRegistry.tsx` ("Saving… / Saved … by …"); ad hoc elsewhere | `useAutosave()` + `SaveStatus` | P1 | S |
| SV2 Staged edits ("nothing saves until Review & save") with a change summary | §7.12 | partial | Roles matrix (doc 01) | `useStagedChanges()` + `ReviewChangesDialog` | P1 | S |
| SV3 Explicit save with unsaved-changes guard (route change and tab close) | §7.12 | partial | `PersonalDetailsPage.tsx` only | `useUnsavedGuard()` | P1 | S |
| SV4 Draft then submit, with a missing-items checklist on submit | §7.12, §6.4 | partial | ISM forms `DRAFT` / `IN_PROGRESS`, `MyDrafts.tsx` | Built into `RecordShell`; `prerequisites(kind, action)` returns missing items | P0 | M |
| SV5 Crash-safe drafts: an error screen never loses typed work | T-92 | missing | `ErrorBoundary.tsx` offers reload only | `useServerDraft()` (`record_drafts`) + IndexedDB mirror; error boundary offers "Restore my draft" | P1 | M |
| SV6 Optimistic concurrency ("changed by <name> since you opened it") | — | partial | Logbooks `p_expected_version` | `version` on the envelope; RPCs take `p_expected_version`; conflict dialog | P1 | S |
| SV7 Nothing overlays primary actions; sticky action bar | T-58 | partial | `AdaptiveActionBar.tsx` | `RecordShell` action bar; toasts bottom-left on record pages | P2 | S |

### P. Expiry interface (exec summary engine 1, §6.2; computation owned by doc 02 X2)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| EXP1 One bucket function shared by UI, calendar, notifications and reports: `valid`, `expiring_90`, `expiring_30`, `expired`, `endorsement_due`, `endorsement_overdue`, `missing`, `not_uploaded`, `no_expiry`, `alerts_off` | §6.2, §5.8 | partial | At least six local implementations: `certificates/constants.ts`, `useCrewCertificates.ts`, `hris/lib/format.ts` (`expiryTone`), `hris/lib/rightToWork.ts`, `hris/lib/reports.ts`, alert generators | `src/lib/expiry/buckets.ts` mirroring SQL `expiry_bucket()` (doc 02); calendar CAL3 and notifications consume it; unit tests share fixtures with SQL tests | P0 | S |

---

## Workflows & state machines

All transitions below run in SQL (`SECURITY DEFINER`, `SET search_path = public`, membership and capability checked first). The client names the action; the server stamps actor, time, company, vessel and status, writes a `record_events` row and emits a notification event in the same transaction.

### A. Record envelope (generic company workflow)

Status keys follow doc 05's vocabulary so safety and every other module read the same:

```
open ──first vessel signature──▶ in_review ──last vessel slot (on_sign: submit)──▶ awaiting_company_close
  │                                   │                                                   │
  │                                   └─ kinds with an initial report (incident):          ├─ company: Sign off & close ─▶ closed
  │                                      Submit ─▶ submitted ─Acknowledge─▶ acknowledged    ├─ company: Return to vessel (reason) ─▶ info_requested ─▶ (vessel edits, re-signs) ─▶ awaiting_company_close
  │                                                                                         └─ company: Not approved (reason) ─▶ info_requested   (RA-style decisions)
  ├─ kinds with company_step = none: last vessel slot ─▶ closed
  └─ Void (policy) ─▶ void
closed ──Reopen (company, reason; kinds that allow it)──▶ acknowledged | in_review  (new cycle)
closed ──Remove company signature (company, reason)──▶ awaiting_company_close
```

- **Whose move** (stored on the envelope, recomputed by trigger): `company` when status ∈ {submitted, awaiting_company_close} or the newest thread entry is a vessel reply to an open request; `vessel` when status ∈ {open, in_review, info_requested} or a company request is open without a reply; otherwise the side that did not post last; `none` when closed or void.
- **Guards** every kind can use: `prerequisites_met(action)` (missing-items list from the kind), `no_open_requests` (close), `no_stale_required_signatures` (submit, close), `company_actor`, `not_voided`, `version_matches`.
- **Snapshots** written on: submit, every company decision, close, reopen, review start.
- **Notifications**: see § N.

### B. Signature slot lifecycle

Per slot, per cycle:

```
waiting ──all earlier required slots signed (or same order group)──▶ open
open ──Pass to X──▶ requested(X) ──Cancel / X declines──▶ open
open | requested ──sign_slot()──▶ signed { method: verified | witnessed | on_behalf }
signed ──record content covered by this slot changes──▶ signed+stale (derived: current digest ≠ signed digest)
signed+stale ──Re-sign (same signer, one tap)──▶ signed (new signature row; old row superseded)
signed ──remove_signature() (latest in cycle only, reason once submitted)──▶ open  (and every later slot returns to waiting)
any ──new review cycle / revert to draft / Return to vessel──▶ superseded (history), new slots created for cycle n+1
```

**Who can act**
- *Sign*: an eligible signer — `slot_eligible(slot, user)` = holds the slot's office on **this** vessel at signing time (`vessel_office_holders`) **or** is one of the slot's named people (e.g. HESS secretary and chairman named in the header), **and** has `sign` on the module, **and** passes the kind's separation-of-duty rules (e.g. AO ≠ CP ≠ permit creator; an approver cannot approve their own submission). Company slots: `is_company_actor()`.
- *Someone else signing?*: any user with write access on the record may start a witnessed ceremony; the person signing must themselves be eligible for the slot (crew picked from the list) **or** the slot must allow visitors / contractors (e.g. PTW competent person from a contractor; never Master, AO, HoD or company slots).
- *Pass to*: anyone with read access may pass an open slot to an eligible person.
- *Remove*: the signer; the Master for vessel slots on their vessel; the company actor for company slots, and for vessel slots only after Return to vessel.
- *Remind*: anyone with write access; once per person per slot per 24 h.

**Signing ceremony (UI)**
1. Slot shows **Sign as <me>** if the user is eligible; otherwise **Pass to…** as the primary button and **Someone else signing?** as secondary.
2. *Sign as <me>*: if no stored signature, `SignatureSetupDialog` ("Draw your signature once; after this, signing is one tap. Manage it under My signature.") saves it, then signs. With a stored image the click signs immediately and shows an undo bar for 10 seconds (undo = remove with reason "undone").
3. *Someone else signing?*: `SignCeremonyDialog` — choose *Me*, *Search crew* (name or position, this vessel's crew list with ranks), or *Visitor / contractor* (name*, company*, capacity*). Then "Hand the device to <name>", a full-screen `WitnessPad` (draw, clear, sign; landscape-friendly on iPad), then back to the witness who confirms. Result: method `witnessed`, witness = logged-in user.
4. *On behalf*: only on slots marked `allow_on_behalf` (voyage reports, Master slots); records the office signed for; the record's Master name is not changed.
5. After signing, `on_sign` triggers run (auto-submit, set status, save record, set Master's name on voyage reports).

**Banners (STORM copy)**: "Waiting for the <role>'s signature — sign in order"; "<Section> must be signed by the <earlier role> first"; "Signed before later edits — re-sign to confirm the current content"; "Review in progress — each section needs signing again".

**Edit-after-sign policy per kind** (registry `edit_after_sign`):
- `allow_with_flag` (RA, HESS, CA before company sign-off): edits allowed; affected signatures turn stale; submit / close blocked until re-signed.
- `lock` (closed permit, submitted incident initial section, company-signed records): fields read-only; change only via **Initiate review** (new cycle) or company **Reopen**.
- `revert_to_draft` (voyage reports): "Revert to draft" supersedes the cycle's signatures; record back to `open`.

**Correction of a signed record without a support ticket (T-314)**: the Master (or company actor) can **Initiate review** with a reason; items can be moved between sections keeping their details and actions; everyone re-signs; the activity trail shows a field diff; the PDF prints "Review 2 — reason".

### C. Company sign-off actions

| Action | From status | Actor | Required input | Result |
|---|---|---|---|---|
| Acknowledge | submitted, awaiting_company_close | company actor | — | `company_ack_by/at`; header line; status `acknowledged` for report-first kinds |
| Decide | awaiting_company_close (RA-style) | company actor | choice ∈ {approved, approved_with_conditions, not_approved}; conditions text when "with conditions"; reason when "not approved"; optional comment | approved / with conditions → `closed` (label per kind, e.g. "Completed"); not approved → `info_requested` |
| Sign off & close | awaiting_company_close | company actor | optional comment; open requests = 0 | `closed`; company signature row; snapshot |
| Close as | submitted, acknowledged, awaiting_company_close (incident); `after_review` only from awaiting_company_close, because it needs the vessel final review (DECISIONS D-30) | company actor | closed_as ∈ {after_review, raised_in_error, duplicate}; duplicate → link required; root cause (locked after save) | `closed` |
| Return to vessel | submitted, acknowledged, awaiting_company_close (DECISIONS D-30) | company actor | reason | `info_requested`; vessel signatures of the cycle superseded; whose move vessel; the vessel re-signs to reach `awaiting_company_close` again |
| Reopen | closed | company actor | reason | new cycle; `acknowledged` (incident) or `in_review` (others) |
| Remove company signature | closed (by sign-off or decision) | company actor | reason | `awaiting_company_close` |

Shore staff can read and post thread updates but cannot acknowledge, decide, sign off, close, return or reopen. A record whose kind has `company_step = sign_off` can never reach `closed` from a vessel action — enforced in `record_transition()` (T-78, T-69).

### D. Status-update thread

Entry types: `update` (company or vessel; optional follow-up date), `request` (company; due date required), `reply` (vessel; references a request), `system` (engine-written: status changes, signatures, reminders, nudges, exports).

```
request: open ──vessel Reply──▶ open (replied) ──company Mark done──▶ done
open ──company Change date (reason)──▶ open (new due date; history kept)
open ──company Cancel (reason)──▶ cancelled
```

- **Follow-up due** = earliest due date among open requests, else the latest `update` follow-up date not yet passed.
- Close and sign-off are blocked while any request is open ("1 open request — mark it done or cancel it first").
- Entries are append-only. "Edit" posts a new entry that references the old one; the old one shows "edited". Deleting entries is not possible; a DPA can **redact** personal data in an entry (text replaced, reason and redactor recorded).
- Notifications: every entry → vessel subscribers for the module + company recipients (batched 15 min), excerpt ≤ 200 chars (omitted for sensitive kinds); request posted → the vessel's current owner of the record (immediately); due today / overdue → same, daily; nudge (company, after 2 days waiting on the vessel) → current signer or owner.

### E. Snapshot and version

`record_snapshots.seq` increments per envelope. Reasons: `submitted`, `decision`, `closed`, `reopened`, `review_started`, `voided`. Payload = envelope + domain row + child rows + current signatures, canonicalised (sorted keys) before hashing in SQL. "View as submitted" opens seq 1; the PDF footer prints the seq and short hash of the snapshot it was rendered from, or "Working copy — not a submitted version" when rendered from live data.

### F. Delete and void

Registry `delete_rule` per kind:

| Rule | Hard delete allowed when | Otherwise |
|---|---|---|
| `draft_only` (default for workflow records) | status = open, no signatures, no thread entries from the company | Void (reason; owner / admins / Master on that vessel) |
| `never_after_submit` (incident, medical case) | status = open and never submitted | No delete, no void by vessel; company may void with reason |
| `until_signed` (drill record, checklist run) | no signatures | Void |
| `free` (custom calendar events, saved views, personal drafts) | always (creator or R&W) | — |
| `cascade_parent` (voyage reports) | per `draft_only`; deleting the last report deletes the voyage | — |

- Who may void, per rule (DECISIONS D-32): `draft_only` / `until_signed` either side (role limits come from capabilities); `never_after_submit` the company only, in every status; `free` / `cascade_parent` never (deleted instead). SQL `void_record()` applies the same matrix as the TS engine (`transitionEnvelope`).
- Legal hold (person or record) blocks delete, void and purge.
- Voided records: hidden from registers and counts by default ("Show voided" filter), still in reports flagged "voided", still exportable for audits, still in subject exports.
- This is deliberately **stricter than the reference**, which lets users permanently delete signed and company-approved risk assessments, closed permits, closed corrective actions and closed HESS minutes (§8.10). ISM record-keeping and PSC inspection need those records to survive.
- Confirmation copy: title "Delete <kind> <reference>?" or "Void <kind> <reference>?"; body states what is lost or kept; buttons "Cancel" / "Delete permanently" / "Void record"; bulk operations require typing the count.

### G. Export job

```
requested ──client export (≤ 5,000 rows, single file)──▶ ready (generated in browser; job row logged first) ──▶ downloaded
requested ──server export (ZIP, Compliance Pack, > 5,000 rows, subject export)──▶ running ──▶ ready | failed
ready ──link TTL passes──▶ expired (re-generate) ──purge_at──▶ purged (file removed, row kept)
```

- Who: the export capability for the module on that vessel (`<module>.<sub>.export`); Compliance Pack: owner, admins, full-access and HoD crew (§7.3); subject export: DPA / owner.
- Every job and every download writes `record_events` (and `data_protection_events` when `contains_personal_data`).
- Files carry a footer "Contains personal data — exported by <name> on <date time UTC>" when flagged.
- Notifications: `export_ready` (immediately, requester only) for server jobs; `export_failed` with a retry link.

### H. PDF rendering

1. Resolve the template from the registry for the kind and variant (`full`, `condensed`).
2. Load assets once: company logo, vessel logo, vessel seal (signed URLs → data URLs), signature images (thumbnails).
3. Render from a **snapshot** when one exists for the requested version, otherwise from live data and mark "Working copy".
4. Blocks in order: header → key/value "General" table (reference, status, dates, revision, content version) → domain sections (tables) → signatures (per slot, current cycle) with the vessel seal beside the Master's block where the kind allows → company acknowledgement / decision block → attachments list (names, sizes, hashes) → notices → hash footer.
5. `finalizePdf()` stamps every page footer ("Generated by STORM — 22 Nov 2026, 14:05 UTC · Draak local 15:05 (UTC+01:00)" · "Page 3 of 7" · reference + version).
6. File name `<VESSELCODE>_<Kind>_<Reference>_<yyyy-mm-dd>.pdf`; logged as an export.

### I. Upload

```
picked ──validate (type list, ≤ 50 MB, image dimensions)──▶ rejected (reason shown) | queued
queued ──compress images > 4 MB (keep original if user ticks "keep original")──▶ uploading (progress; resumable > 6 MB)
uploading ──▶ stored (file_objects row: path, sha256, size, mime) ──attach──▶ attached (record_attachments row)
stored ──duplicate sha256 on the same record──▶ warn "already attached on <date>" (attach anyway / skip)
attached ──new version uploaded (versioned kinds)──▶ superseded (still listed under "Previous versions")
attached ──remove (policy: before submit by uploader / R&W; after submit only by void-capable users, reason)──▶ removed (soft; file kept until purge)
offline ──reconnect──▶ queued (photos taken offline keep their capture time)
```

- Paths: `<company_id>/<vessel_id | fleet>/<module>/<entity_type>/<entity_id>/<uuid>-<safe-name>`; storage policy `storage_path_allowed(bucket, name)` checks company membership, vessel reach and module read (write for INSERT).
- Display: thumbnails for images (HEIC previews generated server-side), inline PDF viewer, download for Office files; every open uses a signed URL (1 h).
- Uploading to a record that is closed is refused unless the kind allows "late evidence" (drills: evidence can be added after completion, §6.8).

### J. Calendar feed

- Sources are SQL views returning `(source_type, source_id, company_id, vessel_id, category, title, subtitle, starts_on, ends_on, all_day, start_time, end_time, due_state, completed, link_path, module_key)`.
- `due_state` ∈ {`upcoming`, `due_soon` (inside the source's window — 30 days for expiries, 7 days for drills and jobs), `overdue`, `completed`}.
- `calendar_feed()` unions the views for the requested range and vessels, drops rows whose module the caller cannot read on that vessel, drops rows of modules switched off for that vessel (doc 01) or not entitled (§ N), and returns counts for the attention banner.
- Custom events: create / edit / delete by the creator or anyone with R&W on the event's category module on that vessel (fleet events: admins). Category controls visibility.
- ICS subscription: user creates a token (shown once), chooses vessels and categories; the `calendar-ics` function returns only what the token owner can currently see; tokens are hashed at rest, can be rotated or revoked, and are revoked automatically when the user loses access or leaves the account. Event descriptions in ICS contain no crew personal data beyond names already visible in STORM, and medical / HR categories are never included.

### K. Entitlement (add-on) check

- `has_vessel_entitlement(vessel_id, addon_key)` is true when the vessel's add-on state is `trial` (and `trial_ends_at > now()`) or `subscribed`.
- Used by: route guards (`<AddonGate addon="deck_plans">`), nav filtering, RLS on add-on tables (INSERT / UPDATE require entitlement; SELECT stays allowed so data survives switch-off), calendar sources, notification emission (no emails for features the vessel no longer has), reports.
- Switched off: pages render read-only with a banner "Deck Plans is switched off for Dagon. Data is kept. An account admin can switch it on in Add-ons." with "Ask an admin" for others.
- State changes (doc 03): owner / admins only, autosave, each change writes `addon_billing_events` and emits `addon_state_changed`; trial ending emits `addon_trial_ending` at 14 and 3 days.

### L. Save behaviours (which pattern where)

| Pattern | Use for | Engine primitive | Rules |
|---|---|---|---|
| Autosave | Settings matrices (vessel settings, add-ons, notification recipients), record drafts while `open` | `useAutosave({ save, debounceMs: 800 })` + `SaveStatus` | Per-field save; failures keep the value and show "Not saved — retry"; never autosave after submit |
| Staged edits | Permission matrix, bulk crew edits, bulk notification changes | `useStagedChanges()` + `ReviewChangesDialog` | Summary of every change before saving; one transaction; audit rows per change |
| Explicit save | Profile edits, single-record admin forms | `useUnsavedGuard()` | Disabled Save until dirty; guard on route change and tab close |
| Draft then submit | Every workflow record (SMS forms, permits, reports, applications) | `RecordShell` + `useServerDraft()` | Server draft + local mirror; Submit shows the missing-items checklist; submit writes snapshot 1 |
| Saved on creation | Records created from a dialog (add crew member's permissions, custom event) | plain mutation | Toast with link to the created record |

Concurrency: every RPC that changes an envelope takes `p_expected_version`; on mismatch the UI shows "Changed by <name> at <time> since you opened it" with *Reload* and *Compare*.

### M. Audit trail

- Writers: triggers on envelope, signature, update, attachment, snapshot and export tables, and on domain tables registered as audited (field diffs for registered fields only). No client inserts.
- Event shape: who (user, party vessel / company / system, impersonator), what (action key), on what (kind, id, reference, vessel), from → to status, field changes (masked for sensitive fields), reason, request metadata (truncated IP, user agent), when.
- Readers: the record's Activity tab (anyone who can read the record; sensitive diffs masked unless T3 access); the fleet audit view (owner, admins with reach, DPA); data-protection activity (doc 03) is a filtered projection.
- Retention: 7 years for workflow records' events by default (ISM / MLC evidence), 365 days visible in the data-protection activity view; open question for exact periods.

### N. Engine notification types (seed; pipeline and frequencies per doc 03)

| Type key | Trigger | Default frequency | Audience |
|---|---|---|---|
| `signature_requested` | Slot opens for an eligible person, or Pass to | immediate, mandatory | must-act: the person(s) eligible / passed to |
| `signature_reminder` | Remind | immediate | the reminded person |
| `signatures_stale` | Edit makes a required signature stale | batch_15m | stale signers |
| `record_submitted_to_company` | Submit / last vessel slot with company step | immediate, mandatory | owner_admins with reach + module company recipients |
| `record_acknowledged` | Acknowledge | batch_15m | record owner, signers, vessel subscribers |
| `record_decision` | Decide | immediate | record owner, signers, vessel subscribers |
| `record_returned` | Return to vessel | immediate, mandatory | record owner, vessel signers |
| `record_closed` | Sign off / Close | batch_15m | record owner, signers, vessel subscribers |
| `record_reopened` | Reopen | immediate | record owner, signers |
| `record_update_posted` | Thread update / reply | batch_15m | vessel subscribers + company recipients |
| `status_request_posted` | Company request | immediate, mandatory | record owner on the vessel |
| `status_request_due` / `status_request_overdue` | Daily job | daily | record owner; overdue also company poster |
| `record_voided` | Void | daily | owner_admins, record owner |
| `export_ready` / `export_failed` | Server export finishes | immediate | requester |
| `personal_data_exported` | Any export flagged personal | immediate | DPA (doc 03 `gdpr_export_generated` covers subject exports) |
| `upload_rejected_scan` | Scanner flags a file (if UP7 adopted) | immediate | uploader, owner_admins |
| `calendar_feed_token_created` | ICS token created | immediate | the user (security notice) |

Each type stores `link_template` (from the registry), `is_sensitive` (excerpt suppressed, never to external addresses), and `module_key` so module subscriptions ("vessel safety subscribers") apply.

---

## Data model

All new tables: `company_id uuid not null`, RLS on, company-scoped reads through `user_belongs_to_company()` plus vessel reach / module capability where noted; writes only through `SECURITY DEFINER` functions unless stated.

| Entity | Key fields | Existing STORM table(s) or NEW | Notes |
|---|---|---|---|
| Record kind | key (pk, e.g. `safety.corrective_action`), module_key, label, ref_prefix, route_pattern, statuses text[], company_step (`none`/`acknowledge`/`sign_off`), edit_after_sign, delete_rule, retention_years, pdf_template_key, snapshot_on text[], sensitive_fields text[], personal_data bool, legal_privilege bool, allow_late_evidence bool | NEW `record_kinds` | Seeded from `src/lib/records/registry.ts` by migration; read-only to tenants |
| Record envelope | id, company_id, vessel_id (null = fleet), module_key, kind_key, entity_id (domain row), reference, title, status, whose_move, last_update_at, follow_up_due, opened_by, opened_at, submitted_by/at, company_ack_by/at, company_decision, decision_conditions, closed_as, duplicate_of_envelope_id, root_cause_locked_at, closed_by/at, current_cycle, content_digest, version, voided_at/by, void_reason, legal_hold bool | NEW `record_envelopes`; doc 05 `safety_records` = this with module_key `safety`; `form_submissions` gets `envelope_id` | Unique (kind_key, entity_id); index (company_id, vessel_id, status), (whose_move, follow_up_due); domain tables keep content |
| Signature slot | id, envelope_id, cycle, slot_key, label, order_no, party (`vessel`/`company`), office_key, named_profile_ids uuid[], required, covers_sections text[], allow_witnessed, allow_visitor, allow_on_behalf, on_sign jsonb, state (`waiting`/`open`/`requested`/`signed`/`superseded`), passed_to_profile_id, passed_at | NEW `record_signature_slots`; replaces `form_templates.required_signers` evaluation and `form_signature_requirements()` | Created by `instantiate_slots(envelope_id, cycle)` from kind or template |
| Signature | id, slot_id, envelope_id, company_id, vessel_id, cycle, signer_profile_id (null for visitor), signer_name, signer_rank, signer_role_label, signer_kind (`crew`/`shore`/`visitor`/`contractor`), visitor_company, method (`verified`/`witnessed`/`on_behalf`), on_behalf_of_office, witness_profile_id, decision (company slots: `acknowledged`/`approved`/`approved_with_conditions`/`not_approved`/`signed_off`), comment, image_path, image_sha256, record_digest, record_version, integrity_hash, signed_at, impersonator_user_id, request_meta jsonb, removed_at, removed_by, removal_reason, superseded_at | NEW `record_signatures`; migrate `form_signatures`, `work_rest_signatures`, `sms_signatures`; logbook keeps `logbook_signatures` (open question) | Append-only except `removed_*` / `superseded_at` set by RPC; stale = `record_digest` ≠ current digest of covered sections |
| Stored signature image | id, profile_id, storage_path (bucket `signatures`), sha256, width, height, created_at, revoked_at | NEW `user_signature_images` | One active row per person; signatures reference the image path used, so later replacement never changes past PDFs |
| Thread entry | id, envelope_id, company_id, entry_type (`update`/`request`/`reply`/`system`), party, author_profile_id, body (≤ 5,000 chars, Markdown subset), follow_up_due, request_due, request_state (`open`/`done`/`cancelled`), request_resolved_by/at, resolution_note, parent_id (reply → request), replaces_id (edit), mentions uuid[], redacted_at/by/reason, created_at | NEW `record_updates`; doc 05 `safety_record_updates` = this | Append-only; trigger maintains envelope whose_move / follow_up_due / last_update_at |
| Snapshot | id, envelope_id, seq, reason, payload jsonb, sha256, created_by, created_at | NEW `record_snapshots`; doc 05 `safety_record_snapshots` = this | Unique (envelope_id, seq) |
| Record event (audit) | id, company_id, vessel_id, module_key, kind_key, entity_id, envelope_id, reference, action, party, actor_user_id, impersonator_user_id, from_status, to_status, field_changes jsonb, reason, request_meta jsonb, created_at | NEW `record_events`; `audit_logs` → compatibility view over it, `activity_log` retired | No UPDATE / DELETE grants; partition by month if volume demands |
| Server draft | id, profile_id, kind_key, envelope_id (null for new), route, payload jsonb, base_version, updated_at | NEW `record_drafts` | Owner-only RLS; purged 30 days after last update or on submit |
| File | id, company_id, vessel_id, bucket, storage_path, original_name, mime_type, size_bytes, sha256, width, height, preview_path, uploaded_by, uploaded_at, source (`upload`/`generated`/`import`/`email`), scan_status, removed_at/by/reason, legal_hold | NEW `file_objects` | Paths per § I; replaces stored public URLs |
| Attachment link | id, file_id, envelope_id or (entity_type, entity_id), section_key, caption, version_of, sort_order, added_by, added_at, removed_at/by/reason | NEW `record_attachments`; existing `form_attachments`, `sms_attachments`, `logbook_attachments`, `crew_attachments`, legal attachments, `trip_suggestion_attachments` migrate over time | Keep existing tables until their modules move |
| Vessel branding | logo_file_id, icon_file_id, seal_file_id (+ IANA `time_zone`) | `vessels` (add columns) | Accepted: JPG, PNG, GIF, WebP, HEIC/HEIF ≤ 5 MB; seal rendered on PDFs |
| Company branding | logo_file_id | `companies.client_logo_url` (public `client-logos` bucket) → `logo_file_id` | Keep `brand_color`, `client_display_name` |
| Export job | id, company_id, vessel_id, requested_by, kind (`record_pdf`/`register_pdf`/`csv`/`xlsx`/`zip`/`compliance_pack`/`gdpr_subject`/`ics`), source_key, params jsonb, contains_personal_data, status (`requested`/`running`/`ready`/`failed`/`expired`/`purged`), storage_path, size_bytes, sha256, row_count, error, link_expires_at, purge_at, created_at, completed_at | NEW `export_jobs`; doc 03 `gdpr_exports` becomes a typed view or child of this | Client exports insert a row via `log_export()` before download |
| Export download | id, job_id, user_id, downloaded_at, request_meta | NEW `export_downloads` | |
| Calendar event (custom) | per doc 02: company_id, vessel_id, category, title*, description, location, starts_on*, ends_on, all_day, start_time, end_time, time_zone, created_by | NEW `calendar_events` (doc 02) | `delete_rule = free` |
| Calendar subscription | id, profile_id, token_hash, vessel_ids uuid[], categories text[], created_at, last_used_at, revoked_at | NEW `calendar_subscriptions` | Token shown once |
| Notification event / inbox / delivery | per doc 03 | NEW `notification_events`, `user_notifications`, `notification_deliveries` (doc 03) | Engines call `emit_notification_event()` |
| Notification type | add `link_template`, `module_key`, `is_sensitive`, `is_mandatory`, `owner_domain = 'engines'` rows | `notification_types` (extend, doc 03) | Seed § N |
| Expiry mute | alerts_muted_at, alerts_muted_by, alerts_muted_reason | add to expiring item tables (crew documents, qualifications, vessel certificates) | Capability-gated |
| Add-on state / billing / request | per doc 03 | NEW `vessel_addon_subscriptions`, `addon_billing_events`, `addon_requests`, `addons` (doc 03) | `has_vessel_entitlement()` defined here |
| Legal hold | per doc 03 | NEW `crew_legal_holds` (doc 03) + `record_envelopes.legal_hold` | |

**SQL functions (all `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon`)**

`instantiate_slots(envelope_id, cycle)`, `slot_eligible(slot_id, user_id) → boolean`, `sign_slot(slot_id, method, image_path, signer_profile_id, visitor jsonb, on_behalf_of_office, expected_version) → jsonb`, `pass_slot_to(slot_id, profile_id)`, `remind_slot(slot_id)`, `remove_signature(signature_id, reason)`, `record_transition(envelope_id, action, payload, expected_version)`, `company_action(envelope_id, action, payload, expected_version)`, `post_record_update(envelope_id, entry_type, body, follow_up_due, request_due, parent_id)`, `resolve_status_request(update_id, resolution, new_due, reason)`, `write_snapshot(envelope_id, reason)`, `record_content_digest(envelope_id, sections text[]) → text`, `can_delete_record(kind_key, entity_id) → boolean`, `void_record(envelope_id, reason)`, `log_export(kind, source_key, params, contains_personal_data, row_count) → uuid`, `calendar_feed(from, to, vessel_ids, categories)`, `has_vessel_entitlement(vessel_id, addon_key)`, `storage_path_allowed(bucket, name, for_write)`, `company_queue(filters)`, `purge_expired_engine_data()`.

---

## Improvements over the reference

1. **Company sign-off is a database rule, not a convention** (T-78, T-69). No record whose kind needs the company can show Closed or Completed after only the Master's signature; the reference had shipped exactly that bug.
2. **Company decision in one step** (T-33). Choice, conditions or reason, and comment are one dialog with one confirm; no "save draft, reopen, then approve".
3. **Correct a signed record without a support ticket** (T-314). Initiate review with a reason, move items between sections keeping their actions, everyone re-signs, a diff is kept, and the PDF says which review it is.
4. **Configurable slots per template** (T-50, T-74). A fleet admin can require five signatures on a passage plan, or a Chief Engineer → Superintendent sign-and-close chain on a monthly technical report, without code.
5. **Shore mailbox routing on sign or submit** (T-24, T-74, T-5, T-6). A notification type can add an external mailbox (e.g. the technical department address) so a bunker request or a technical report reaches the shore team the moment it is signed, with a deep link.
6. **Emails open the exact record with a short excerpt** (T-252), and sensitive kinds never put content in email.
7. **Edits un-verify and notify** (T-139, T-163). The same digest that flags stale signatures flags stale document verifications; the verifier is notified to re-check.
8. **Reminders and nudges are built in** (T-133, T-148, T-286). Any pending signature or request has Remind, with rate limiting and an audit line; soft nudges for HoDs before the Master's step.
9. **Delivery visibility** (T-120, T-278, T-282). Doc 03's delivery log plus a per-person "last 10 emails / bounced" note on the user, so "they never got the invite" is answerable without support.
10. **Nothing typed is lost** (T-92). Drafts are saved to the server and the device; the error screen offers "Restore my draft"; no forced reload.
11. **No pop-up over Save** (T-58). Sticky action bar; toasts never cover primary actions.
12. **Uploads that open** (T-107). Paths plus signed URLs, previews for images including iPhone HEIC photos, 50 MB everywhere, the same accepted types everywhere.
13. **Bulk upload with progress** (T-46, T-132). Multi-file queue, per-file status, optional extraction.
14. **Void with a reason instead of "no way to delete" or "delete everything"** (T-201). Captain, Purser or fleet admin can void a wrong record; it disappears from registers but stays for audit. Signed and company-approved records are never permanently deleted (the reference allows it).
15. **Approver edits are visible and notified** (T-200). Field diffs in the activity trail, a thread entry to the subject, and "send back" via Return.
16. **Threads with follow-up dates and whose move on every list** (T-153). The reference left its status-update post unexercised; STORM makes it the backbone of company–vessel communication.
17. **One preference, two windows** (T-79), consolidated per-vessel digests (T-142), DPA notified of sensitive changes (T-96) — via doc 03's pipeline.
18. **Signatures are bound to the right people.** HESS slots accept only the secretary and chairman named in the header (or a witnessed signature recorded as such); the reference recorded whichever account clicked.
19. **Every signed PDF is verifiable**: content and integrity hashes on all signed records (reference: HESS only), the vessel seal actually printed (reference: uploaded but never printed), times with a zone (reference: none in the UI).
20. **PDFs designed, not dumped** (T-290). One anatomy, consistent header and footer, compressed images (reference HESS: 14 pages, over 10 MB).
21. **Calendar you can subscribe to**, loading in under a second (reference ~10 s), with the attention banner and module-based visibility.
22. **Exports are accountable**: every export and download logged, personal-data notice on the file, short-lived links.
23. **Add-on trials do not lapse silently**: 14- and 3-day reminders, data kept read-only after switch-off, and an in-app request button for vessel crew (T-268).
24. **Muting expiry alerts is controlled** (T-160): only officers and management can mute, with a reason, and muted items still appear greyed in reports.
25. **Impersonation can never sign.** "Login as" is for support; signatures and company decisions are refused while impersonating, and every other action records both identities.

---

## Implementation notes

### Module layout (TypeScript)

```
src/lib/records/
  registry.ts            RecordKind definitions (one per kind; domain docs add theirs)
  types.ts               Envelope, Slot, Signature, Update, Snapshot, RecordEvent
  links.ts               recordLink(kind, id, vesselCode, panel?)
  whoseMove.ts           pure helpers for display (server is the source of truth)
  api.ts                 typed RPC wrappers: transition, companyAction, postUpdate, resolveRequest, voidRecord
  hooks.ts               useEnvelope(kind, id), useRecordEvents(envelopeId), useCompanyQueue(filters)
src/lib/signatures/
  api.ts                 signSlot, passSlotTo, remindSlot, removeSignature, getMySignature, saveMySignature
  slotState.ts           pure: derive UI state (waiting/open/requested/signed/stale) — unit-tested
  hooks.ts               useSignatureSlots(envelopeId, cycle), useMySignature()
src/lib/pdf/
  document.ts            createRecordPdf({ kind, variant, envelope, assets }) → jsPDF; finalizePdf(doc, meta)
  blocks/                header.ts, footer.ts, keyValueTable.ts, sectionTable.ts (jspdf-autotable),
                         signatureBlock.ts, sealBlock.ts, acknowledgementBlock.ts, notice.ts, hashFooter.ts
  assets.ts              loadBrandAssets(companyId, vesselId) → data URLs (signed URL fetch, downscale)
  templates/<kind>.ts    one per record kind (registered in records/registry.ts)
  pdfTemplate.ts         keep exports for current callers; re-implement on top of document.ts
src/lib/export/
  csv.ts  xlsx.ts        toCsv(rows, columns), toXlsx(sheets) (ExcelJS, as in documentExport.ts)
  fileName.ts            exportFileName({ vesselCode, kind, ref, from, to, ext })
  jobs.ts                logExport(), requestServerExport(), useExportJob(id), useMyExports()
src/lib/storage/
  files.ts               ACCEPTED_TYPES, MAX_BYTES (50 MB), validateFile, uploadFile({ scope, entity }), signedUrl, removeFile
  crewDocuments.ts       becomes a thin wrapper over files.ts
src/lib/calendar/
  sources.ts             category → colour, icon, label, module
  feed.ts                useCalendarFeed({ from, to, vesselIds, categories })
  ics.ts                 toIcs(events)
src/lib/entitlements/
  hooks.ts               useVesselEntitlement(vesselId, addonKey)
src/lib/save/
  useAutosave.ts  useStagedChanges.ts  useUnsavedGuard.ts  useServerDraft.ts
src/lib/expiry/
  buckets.ts             expiryBucket(item, today) — mirrors SQL expiry_bucket() (doc 02 X2)

src/shared/components/records/
  RecordShell.tsx  RecordHeader.tsx  WhoseMoveChip.tsx  RecordBanners.tsx  RecordActionBar.tsx
  SignaturePanel.tsx  SignatureSlot.tsx  SignatureBlock.tsx  SignCeremonyDialog.tsx  WitnessPad.tsx
  SignatureSetupDialog.tsx  PassToDialog.tsx  StaleSignatureBanner.tsx  OrderBanner.tsx
  CompanyDecisionPanel.tsx  CompanyActionsMenu.tsx
  StatusThread.tsx  StatusRequestCard.tsx  UpdateComposer.tsx
  ActivityTimeline.tsx  SnapshotViewer.tsx  VersionDiff.tsx
  AttachmentsPanel.tsx  FileDropzone.tsx  FilePreview.tsx
  ExportMenu.tsx  DeleteRecordButton.tsx  ConfirmDestructiveDialog.tsx  VoidDialog.tsx
  SaveStatus.tsx  ReviewChangesDialog.tsx  AddonGate.tsx
src/modules/me/pages/{MySignaturePage,MyExportsPage,MyCalendarFeedPage}.tsx
```

The drawing canvas in `ism/forms/components/SignaturePad.tsx` and `legal/components/forms/SignatureField.tsx` (pointer events, DPR scaling, clear) is the starting point for `WitnessPad` and the set-up dialog; drop the typed-name tab for slots (drawn only, §8.1), keep typed acknowledgement for legal forms.

### Server pieces

- **Migrations** (one per engine, in this order): `…_engines_registry_envelopes.sql` (record_kinds, record_envelopes, record_events + triggers, record_transition skeleton), `…_engines_signatures.sql` (user_signature_images, record_signature_slots, record_signatures, `signatures` bucket + policies, RPCs), `…_engines_company_threads_snapshots.sql`, `…_engines_files.sql` (file_objects, record_attachments, `storage_path_allowed`, bucket limit / type alignment, fixes for `incident-attachments` and `development-documents` policies), `…_engines_exports.sql`, `…_engines_calendar.sql` (with doc 02), `…_engines_entitlements.sql` (with doc 03), `…_engines_backfill.sql` (form_signatures → record_signatures; stored public URLs → paths).
- **Edge functions**: `export-builder` (ZIP / Compliance Pack / large xlsx; streams to `exports` bucket; writes `export_jobs`), `export-download` (checks access, logs `export_downloads`, returns a short signed URL), `calendar-ics` (token auth, no JWT), `media-normalise` (HEIC → JPEG preview, thumbnails, optional scan hook), `notification-dispatcher` (doc 03). Schedule nightly `purge_expired_engine_data()` and the daily follow-up job with the same mechanism doc 03 chooses (verify the schedule exists live — the system audit found declared but unscheduled cron jobs).
- **Immediate security fixes (S, no UI dependency)**: authenticate `send-email` callers (service role only), remove caller `from` / `cc`, HTML-escape variables; delete `sign-submission` and `submit-form`; replace the `incident-attachments` and `development-documents` storage policies with company-prefixed path checks and move existing objects; add a membership check to `get_recent_activity()` (or drop it); stop `FormsArchive` claiming a PDF was downloaded.

### Reuse (existing code that already does part of the job)

| Need | Reuse |
|---|---|
| Ordered slots, cycles, append-only signatures, server-set status | `form_sign_submission()`, `form_signature_requirements()`, `form_submissions_before_write()` in `20260919210000_ism_form_workflow.sql` |
| Digest + optimistic version + witness attestation | `logbook_entry_digest()`, `logbook_sign_entry(p_expected_version …)`, `attested` kind in `20260917200100_logbook_meridian_books.sql` |
| Trigger-only immutable event trail | `legal_request_events` + `legal_requests_after_change` trigger (`20260919120000_legal_module.sql`) |
| Path-validating storage policy | `legal_attachment_path_allowed()` |
| Path + signed URL client helper; legacy URL → path resolver | `src/lib/storage/crewDocuments.ts` (`resolveCrewDocumentPath`) |
| Excel / table PDF | `src/lib/documentExport.ts` (ExcelJS), `logbookPdf.ts` (jspdf-autotable, "Page N of M", UTC labels) |
| Server-owned numbering | `next_reference_value()` / `format_reference()` (`20260919220000_reference_numbers.sql`, doc 01) |
| Scheduled job shape | `supabase/functions/hr-daily-sweeper` (service-role or shared-secret bearer) |
| Save status copy | `LogbookRegistry.tsx` ("Saving… / Saved … by …") |
| Unsaved guard | `PersonalDetailsPage.tsx` (beforeunload + discard dialog) |

### Reconciliation with other docs

- Doc 05 names (`safety_records`, `safety_record_updates`, `safety_record_snapshots`, `safety_record_transition`) → create the generic tables here and, if the safety team prefers those names in code, add views `safety_records AS SELECT … FROM record_envelopes WHERE module_key = 'safety'`. Do **not** create parallel tables.
- Doc 03 `gdpr_exports` → a `kind = 'gdpr_subject'` row in `export_jobs` with a child row for request linkage, so the exports log is complete.
- Doc 02 `fleet_calendar_feed` → the same function as `calendar_feed` (vessel calendar passes one vessel id).
- Doc 01 `permission_audit_log` stays (permission domain), but its inserts move to definer functions and it feeds `data_protection_events`.
- `audit_logs` → keep as a view over `record_events` (columns mapped) until the 32 HRIS / certificate callers are replaced by triggers; then revoke INSERT.

### Pitfalls

- **Digest determinism**: compute digests only in SQL (`jsonb` canonical text after removing volatile keys such as `updated_at`); never trust a client digest. Section coverage must be declared in the registry so a change to section 3 does not stale the section-1 signature.
- **Images in rows**: never store base64 signatures in table rows (today's `form_signatures.signature_data`); store a path and a hash, and never select image data in list queries.
- **Polymorphic RLS**: denormalise `company_id`, `vessel_id`, `module_key` onto every engine table and check `has_capability(<module>.view, vessel)` there; do not join back to domain tables inside policies (performance and recursion).
- **Definer functions**: every one checks `auth.uid()` membership of the target company first (the `get_recent_activity()` mistake), sets `search_path`, and revokes from `PUBLIC, anon`.
- **Transactions**: signature insert, status change, event, snapshot and notification emit happen in one transaction; the dispatcher reads committed events only (outbox).
- **jsPDF**: page totals need a second pass; images must be data URLs (fetch through signed URLs, mind CORS); embed each image once; jsPDF has no HEIC support (use the generated preview).
- **Time zones**: store `timestamptz`; display in the viewer's zone with the zone label; PDFs print UTC plus vessel local when `vessels.time_zone` is set (add the column).
- **Satellite links**: keep RPC payloads small; compress images before upload; retries must be idempotent (client-generated `idempotency_key` on sign, post-update and upload attach).
- **Impersonation**: refuse `sign_slot`, `company_action` decisions and `remove_signature` when an impersonation claim is present.
- **Legacy data**: `form_signatures.signature_type` includes `TYPED`; migrated typed signatures display as "Typed (legacy)" with no image and no badge upgrade.
- **Module switches / add-ons**: calendar, notifications and reports must call the same `module_enabled()` (doc 01) and `has_vessel_entitlement()` checks, or switched-off modules will keep emailing.

### Build order

1. Security fixes listed above (S each).
2. Registry + envelopes + `record_events` + `record_transition` skeleton (REG1–3, AU1–2).
3. Upload engine and storage fixes (UP1–2) — every later engine attaches files.
4. Signatures (SIG1, SIG3–7, SIG9–12, SIG17) with the CA flow (doc 05) as the first consumer.
5. Company sign-off (CO1–6, CO9) and threads (TH1–4), snapshots (SN1).
6. PDF anatomy (PDF1–3) + export menu and logging (EX1, EX2 for CA / incident / RA / permit, EX4, EX7).
7. Delete / void (DEL1–3) and save primitives (SV4, SV1, SV3).
8. Notification emit wiring (NO1–3) once doc 03's pipeline exists.
9. Calendar feed (CAL1–5), entitlements (AD1–3), server exports (EX3), remaining P1/P2.

### Tests

- SQL: slot ordering, parallel groups, eligibility by vessel (Master of Hydra cannot sign a Draak slot), SoD, reverse-order removal, stale detection, company gate (vessel user cannot close), open-request close block, void and delete rules per kind, legal hold, impersonation refusal, storage path policy (cross-tenant read denied).
- TS: `slotState.ts`, `whoseMove.ts`, `expiry/buckets.ts` (shared fixtures with SQL), `fileName.ts`, `ics.ts` (RFC 5545 validation), `validateFile`.
- PDF snapshot tests: header / footer / signature block positions for one kind per template family; "Page N of M" correct on multi-page output.
- E2E: CA end to end (SO/HoD → Master auto-submit → company acknowledge → sign off → remove company signature), witnessed signature on a shared iPad, pass-to from a shore user, crash during draft then restore.

---

## Open questions

1. **Step-up for signing.** Should a Verified signature or a company decision require re-entering a password or authenticator code (for example when the session is older than 12 hours), or is the logged-in session enough as in the reference?
2. **Delete versus void.** STORM proposes no permanent deletion of signed, submitted or company-approved records (stricter than the reference). Confirm, and set retention periods per kind (e.g. ISM records, permits, hours of rest, medical cases) and who may void.
3. **Visitors and contractors as signers.** Which slots may a non-crew person fill through the witnessed pad (proposal: permit competent person and handover acceptance only; never Master, AO, HoD or company slots)?
4. **Pass to a shore user.** Can a passed-to shore user (e.g. a superintendent not on the crew list) sign from their own device through the emailed link, or must vessel slots always be signed by vessel crew?
5. **HESS signers.** Bind the secretary and chairman slots strictly to the people named in the header (proposal), or allow any holder of the office?
6. **One signature store or two.** STORM proposes a single stored signature (profile shows it). Does the fleet need a separate "profile signature" for contracts and crew documents?
7. **Logbook signatures.** Keep the statutory logbook ledger (`logbook_signatures`, page sealing) separate and only share the UI block and method vocabulary, or migrate it into `record_signatures`?
8. **Time on PDFs.** UTC only, or UTC plus vessel local time? (Requires a vessel time-zone setting, possibly changing during a voyage.)
9. **Hash verification.** Offer a verification page (paste a PDF's integrity hash, see whether it matches a record)? If so, logged-in users only, or a public page that reveals only "matches record <reference> issued on <date>"?
10. **Add-on billing.** Will STORM invoice in-app (card or bank payments, proration, currency) or export billing events for manual invoicing? What happens to add-on data after a long switch-off (kept indefinitely read-only, or purged after a period)?
11. **Malware scanning.** Is scanning uploaded files required for the target customers, and which provider is acceptable as a sub-processor?
12. **ICS feeds.** Allowed at all for crew users, and which categories may leave STORM in a subscription feed (proposal: never medical or HR)?
