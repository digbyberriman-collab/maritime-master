# STORM Upgrade Plan — Blueprint Functional Parity

Status: **Plan v1, awaiting sign-off on the decisions in §2.**
Reference: Sealogical Blueprint v1.3 (21 Nov 2026), used for functional structure only. No Sealogical screens, copy, names, icons or assets are to be reproduced. Sample data from that document is not imported.

---

## 1. Goal and definition of done

Bring STORM to functional parity with the blueprint's two-level model (Fleet view and Vessel view), built on STORM's own design system (Abyss / Deep / Slate / Drift / Signal tokens) and STORM's existing modules.

A phase is done only when all of these are true:

1. `npm run build`, `npx tsc --noEmit` and `npm test` pass. Test count must not drop below the current baseline.
2. Lint introduces zero new errors. The 401 pre-existing errors are not to be worsened.
3. New tables have RLS enabled, with policies covering the super-admin, role and vessel-scope cases. An RLS test is added for each new table.
4. Every new route is permission-gated through the existing `storm.json` permission catalogue, and the catalogue is updated in the same PR.
5. The Digby→Gabe migration is not broken. The schema-only dump in MIGRATION-PLAN.md Stage 2 must still work after the phase.
6. The phase is shipped as its own PR, with its own verification notes.

---

## 2. Decisions needed before Phase 1

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| D1 | **Tenancy.** Keep STORM single-tenant (Inkfish fleet), or add an `account_id` tenant boundary across all tables? | Keep single-tenant for now. Add `account_id` only when a second paying account is signed. | Only 4 migrations reference tenant or account fields. Retrofitting tenancy touches every table and every RLS policy, so it's a separate, large phase (Phase 9). |
| D2 | **Gabe migration sequencing.** Freeze the schema before Stage 2 dump, or keep building through it? | Ship Phases 1–3 first, then run the Stage 2 dump on a tagged commit. | Every new table is one more thing Gabe's schema must carry. A tagged commit keeps the dump reproducible. |
| D3 | **Vessel Management Department (VMD) restriction.** Stays deferred? | Stays deferred. It's out of scope for this plan. | MIGRATION-PLAN §7 records it as deferred by instruction. This plan does not touch it. |
| D4 | **Nav shape.** Replace the 6-module nav with Fleet + Vessel, or map Fleet + Vessel onto the existing 6? | Map onto Fleet + Vessel, keep Shoreside / Health / Yard / HRIS as Fleet-level sections. | Avoids breaking HRIS and Health, which are production-ready. |

Until D1 and D2 are confirmed, no code is changed outside this document.

---

## 3. Current state (from code, 2026-11-21)

| Area | Status | Evidence |
|---|---|---|
| Crew, certificates, drills, incidents, work-rest, documents | Real | `src/modules/{crew,certificates,drills,incidents,work-rest,documents}` |
| HRIS | Production-ready | `src/modules/hris`, `docs/HRIS.md` |
| Itinerary (voyage), logbooks | Partial / prototype | `src/modules/itinerary`, `src/modules/logbooks`, `docs/LOGBOOKS.md` |
| Risk assessments | Partial | `src/modules/risk-assessments` |
| Maintenance | Partial | `src/modules/maintenance` (5 files) |
| Charter / guest | **Missing** | No `src/modules/charter` |
| Support tickets, company FAQ, GDPR, add-ons | **Missing** | No modules |
| Permit to work | **Missing** | Not present |
| Refit `rf_*` schema | **Missing** | 0 migrations create `rf_*` tables |
| Multi-tenancy | **Absent** | 4 migrations reference tenant or account fields |
| Permission catalogue | Present | `docs/permissions/catalogues/storm.json` |
| Edge functions | 28 | `supabase/functions`, all `verify_jwt = false` per MIGRATION-PLAN R3 |
| Tests | 72 test files | `src/**/*.test.*` |
| Nav "Coming Soon" text | 32 occurrences in `src` | Audit (Sep 2026) reported ~265 leaves; reconcile in Phase 1 |

---

## 4. Blueprint-to-STORM gap matrix

Legend: **Have** = exists and works · **Partial** = exists, missing sections · **Gap** = not built.

### 4.1 Fleet view (blueprint §4)

| Blueprint section | STORM today | Status | Phase |
|---|---|---|---|
| Fleet Dashboard (KPIs) | `dashboard` / home | Partial | 5 |
| Fleet Tracker | `vessels`, map | Partial | 5 |
| Fleet Reports | `analytics`, `audits` | Partial | 5 |
| Fleet Calendar | `notifications` (no calendar feed) | Gap | 5 |
| Fleet Documents + acknowledgements | `documents` | Partial (no acknowledgements) | 3, 5 |
| Forms & Checklists builder | `forms`, `ism` | Partial (no template lifecycle) | 5 |
| Fleet Training (catalogue, applications, budgets) | `training` | Partial | 5 |
| Fleet Medical | `health` | Partial | 5 |
| Fleet Visits / occasional workers | `crew` (no visitor entity) | Gap | 5 |
| Fleet Employment (employing companies, vacancies) | `hris`, `rotation-planner` | Partial | 5 |
| Users & Access + matrix | `users-access` | Have | 2 |
| Notification Management | `notifications-admin` | Have | 2 |
| Support Tickets | — | Gap | 5 |
| Company FAQs | — | Gap | 5 |
| Add-ons / module billing | — | Gap | 5 (later) |
| Vessel Settings (module on/off per vessel) | `settings` | Partial | 1 |
| Vessels | `vessels` | Have | — |
| Fleet GDPR | — | Gap | 5 |
| Account / Security | `auth`, `settings` | Partial | 2 |

### 4.2 Vessel view (blueprint §5)

| Blueprint module | STORM today | Status | Phase |
|---|---|---|---|
| Crew (list, profiles, documents, STCW, planner, compliance matrix, hours of rest) | `crew`, `rotation-planner`, `work-rest` | Have, except compliance matrix | 4 |
| Safety — SMS summary, drills, PTW, SMS forms, risk assessments | `drills`, `incidents`, `risk-assessments` | Partial (no PTW, no SMS form framework) | 4 |
| Certificates (sectioned, expiry, endorsement windows) | `certificates` | Partial (no endorsement windows) | 3 |
| Technical (PM jobs, equipment, inventory, PO, surveys, rounds) | `maintenance` | Partial | 6 |
| Charter (trips, planner, guest list FAL 6, checklists) | — | Gap | 6 |
| Vessel (voyage plans, departure/noon/arrival, AIS, vessel record) | `itinerary`, `logbooks` | Partial | 6 |
| Calendar (generated + custom) | — | Gap | 5 |
| Reports (18 incl. compliance pack ZIP) | `analytics` | Partial | 6 |

---

## 5. Phases

Each phase is one PR (or a short series), gated by §1.

### Phase 0 — Baseline and hygiene (no feature change)

1. Install dependencies. Record baseline: build, `tsc`, `npm test` count, lint error count. Commit the numbers into this document.
2. Confirm the open manual actions with Digby: revoke the leaked PAT (M1), rotate the source Supabase anon key (M2). These cannot be done from the repo.
3. Edge function audit: for each of the 28 functions with `verify_jwt = false`, confirm internal auth. List any that don't, and fix them before any new function is added.
4. Reconcile the "Coming Soon" count. Either the audit's ~265 figure or the 32 text occurrences is out of date. Pick one source of truth.

**Exit:** baseline recorded; edge-function audit list written; no regressions.

### Phase 1 — Information architecture

1. Restructure navigation into **Fleet view** and **Vessel view** per blueprint §1.3. Keep the existing module routes; only the nav grouping changes in this phase.
2. Vessel view tabs: Crew, Safety, Certificates, Technical, Charter, Vessel, Calendar, Reports. Charter, Technical and Calendar show "not yet built" states until their phases land. No dead links.
3. Per-vessel module visibility (blueprint §4.16): a `vessel_modules` table holding enabled and label overrides per vessel. The nav reads from it. Default is all on, so no existing vessel loses access.
4. Keep the blueprint's dashboard-preferences pattern: lg/md/sm layouts per user per vessel (already in AGENTS.md for OceancOS; apply the same to STORM if the dashboard is the same pattern).

**Exit:** nav matches the blueprint's two-level model; per-vessel visibility works; existing routes unchanged.

### Phase 2 — Roles and permissions (blueprint §2)

1. Account roles: Owner, Admin (with "manages admins" and DPA flags), Shore Staff, Vessel Crew, External viewer. Map each to STORM's existing `roles` table. Do not create a parallel role system.
2. Crew per-vessel presets: View Only, Head of Department, Full Access, Custom. Module levels: None / Read Only / Read & Write. Individual flags on top.
3. Access Sets (§2.5): named bundles of the above, assignable to users.
4. Gated areas (§2.7) are enforced both client-side and in RLS. Client checks are never the only check.
5. Update `storm.json` and the permission matrix workbook in the same PR.
6. Preserve the VMD restriction as documented (D3). Do not change its behaviour.

**Exit:** a crew user without a module grant sees no module; RLS tests cover every preset.

### Phase 3 — Data model foundations (blueprint §3, §8)

Build shared engines once, then reuse them in every later phase:

1. **Expiry engine**: buckets expired / ≤30d / ≤90d / endorsement due or overdue. Used by crew documents, certificates, medicals, training and visitors.
2. **Signature engine** (§8): ordered signatures, "sign as / someone else signing / pass to / remove signature", stale-signature warning after edits, Verified / Witnessed / on-behalf-of. Company sign-off by owner or admin.
3. **Status-update threads** with follow-up dates and "whose move" (the Company as an actor in workflows).
4. **Audit trail**: every state change and signature writes an `audit_logs` row with actor and before/after.
5. **File uploads**: 50 MB cap, private buckets, signed URLs.

**Exit:** the four engines have unit tests and one reference consumer each (certificates for expiry; drills for signatures).

### Phase 4 — Vessel Safety and Crew

1. **Permit to work** (§3.13, §6.7): Hot Work checklist captured in full, gas readings, isolations, sign-off order.
2. **SMS form framework** (§3.10): one generic submission model with statuses and the signature engine. Incident, corrective action, medical case, HESS meeting and handover become configurations of it. The 52 contributing-factor codes come from a seeded table.
3. **Corrective action** ordered sign-off (§6.5).
4. **Risk assessments**: hazard scoring and HoD → Captain → Company approval chain (extends the existing module).
5. **Crew compliance matrix** (§6.29): required qualifications per position, using the expiry engine.

**Exit:** a Hot Work PTW can be drafted, signed in order, and audited end to end. An incident can be raised and corrected with the company sign-off.

### Phase 5 — Fleet-level admin

1. **Support tickets** (§3.31, §6.17, §9): with the badge count and the status thread.
2. **Company FAQ** and suggestions (§3.32).
3. **GDPR records and subject requests** (§3.33, §6.21). Retention rules come from the existing `data_retention_policies`.
4. **Fleet calendar** and the **calendar feed** (§7.2), sourced from the expiry engine and maintenance.
5. **Fleet documents with acknowledgements** (§3.25, §6.18).
6. **Checklist template lifecycle** (§6.19).
7. **Visitors / occasional workers** (§3.28) with the expiry engine for their documents.
8. **Fleet dashboard KPIs** and **tracker**.
9. **Add-on subscriptions** (§3.23, §6.22). Deferred to the end of this phase; no payment provider is integrated in this plan.

**Exit:** every Fleet sidebar item in §4.1 is either Have, or explicitly out of scope with a reason recorded here.

### Phase 6 — Vessel Technical, Charter, Vessel, Reports

1. **Technical**: PM jobs by calendar or running hours, completion logged to the logbook (§6.11, §6.30); equipment register; inventory with stock levels; purchase orders (§6.31); surveys; rounds; maintenance periods with the 5-step wizard (§6.26).
2. **Charter**: trips, planner, guest list with FAL 6 export, guest checklists (§3.19, §6.16).
3. **Voyages**: Departure → Noon → Arrival reports with Master's signature (§3.15, §6.10). AIS tracking stays provider-neutral, following the AGENTS.md pattern.
4. **Reports**: 18-report catalogue with the compliance pack ZIP (§7.3).

**Exit:** each Vessel tab in §4.2 is Have.

### Phase 7 — Signatures, PDF and notifications (blueprint §8.8–8.10)

1. PDF export anatomy: signature blocks, vessel seal and logo, notification footer. Uses the existing `jspdf` / `jspdf-autotable` stack.
2. Email notification management per user and per event, with the blueprint's "subscriber" model for safety notices.
3. Delete rules: records with signatures are not hard-deleted; they are voided with a reason.

**Exit:** a signed PDF from each phase-4 form, and a notification preference change reflected in sending.

### Phase 8 — Cross-cutting polish

1. Exports: PDF / CSV / Excel on every list.
2. Save behaviours (§7.12): unsaved-change guards, autosave where the blueprint shows it, consistent toasts.
3. Replace remaining hardcoded alerts on `/alerts` with the expiry engine output.
4. Offline / emergency bar: out of scope for this plan. Recorded as a later phase.

### Phase 9 — Tenancy (only if D1 changes)

Add `account_id` to every table, rewrite every RLS policy, and add tenant-isolation tests. This is the largest single change in the plan and is not started until D1 is decided.

---

## 6. Verification gates (every phase)

- `npm run build` ✅
- `npx tsc --noEmit` ✅
- `npm test` ✅ (count ≥ previous)
- `npm run lint` — no new errors vs baseline
- RLS tests for each new table, including: unauthenticated, crew without grant, shore staff, admin, super-admin
- Manual pass in the browser at phone width and desktop, dark mode first
- Schema dump still valid (Stage 2 command runs against a scratch database)

---

## 7. What this plan does not do

- Does not copy Sealogical's layouts, wording, icons, screenshots or assets.
- Does not import any blueprint sample data (vessel names, crew names, reference numbers).
- Does not touch the VMD restriction (D3).
- Does not rotate keys, revoke tokens or perform any step in MIGRATION-PLAN §4 that is listed as manual. Those are Digby's or Gabe's actions.
- Does not change the Gabe migration history without a tagged commit (D2).

---

## 8. Open risks

| # | Risk | Mitigation |
|---|---|---|
| U1 | Leaked PAT is still in git history | Revoke (M1). History rewrite is a separate decision. |
| U2 | 28 edge functions with `verify_jwt = false` | Phase 0 audit before any new function |
| U3 | `rf_*` refit schema has no migrations | Recorded as a Phase 6 dependency; Yard refit stays flagged as prototype until fixed |
| U4 | Scope is large; parity claims can drift | Gap matrix (§4) is the source of truth; each PR updates its rows |
| U5 | Single-tenant assumption baked into 100+ tables | D1 decision; Phase 9 is the explicit cost |
