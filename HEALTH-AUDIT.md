# Health & Wellness Section Audit

**Date:** 2026-09-19
**Branch:** `claude/amazing-mccarthy-sri0ln`
**Scope:** Every leaf under the Health & Wellness module in `src/config/sitemap.ts` (Medical, Spa, Nutrition, Physio, Personal Training), plus the access control, data and routing substrate they depend on.
**Method:** Static review of the sitemap, router, migrations, generated types and RBAC resolvers; baseline lint / typecheck / test run on a clean checkout with dependencies installed; the sitemap tree executed to enumerate every leaf and its route status.

---

## 1. Executive summary

The Health & Wellness section does not exist as a system. It is navigation and nothing else.

- **51 of 51 leaves render the generated "Coming Soon" placeholder.** Not one page in the section has a real implementation. There are no health module directories under `src/modules`, no routes, no hooks.
- **No health tables exist.** The only clinically adjacent data in the schema is `medical_reports` (7 columns, attached to incidents, never read by any UI), one `profiles.medical_expiry` date, a `Medical` value in the crew certificate type list, and two medical fields on `pre_departure_checklists`. Nothing exists for patients, medical stores, controlled drugs, equipment, protocols, spa bookings, nutrition, physiotherapy or training programmes.
- **The section has no access control, and the control it inherits is wrong for clinical data.** `canAccessModule('health')` maps the module to the RBAC key `crew_roster` (`src/modules/auth/contexts/AuthContext.tsx:201`), so anyone who can see the crew list can open the entire section, medical included. No leaf carries a `moduleKey`, so the sidebar hides nothing. A `crew.view_medical` capability exists in the catalogue and a `view_medical` action exists in the RBAC matrix, but nothing reads either for routing or row access.
- **Placeholder routing itself works correctly.** All 51 leaves are registered from `PLACEHOLDER_LEAVES`, and 13 group redirects resolve to a first leaf. The scaffolding the section needs is in place; only the section is missing.

The comparison is exact: this is the position HRIS was in before its build. The same substrate that fixed HRIS — a SQL-and-TypeScript mirrored access resolver, company-scoped tables with RLS, a module-gated route file, one page skeleton — is what this section needs, plus a stricter confidentiality model, because clinical records are more sensitive than pay.

---

## 2. Baseline checks

Run on this branch with `npm install` (not `npm ci` — see below).

| Check | Result | Notes |
|---|---|---|
| `npm install` | PASS | 665 packages. |
| `npm run typecheck` | PASS | |
| `npm test` | **FAIL** | 648 passed, 2 failed, both in `src/test/hris/ContractsPage.test.tsx`. Pre-existing and unrelated to this section. |
| `npm run lint` | **FAIL** | 1 error, 861 warnings. The error is `prefer-const` in `src/integrations/supabase/previewAuthStorage.ts:38`. Pre-existing and unrelated. |
| `npm run build` | PASS | |

Both pre-existing failures block CI, so both are fixed as part of this work:

- `previewAuthStorage.ts:38` — `let timer` is never reassigned.
- `ContractsPage.test.tsx` — the test asserts the literal string `74d remaining`, computed from a contract end date fixed relative to the date the test was written. It fails on any other day. The fix makes the expectation relative to the current date rather than hard-coded.

---

## 3. Leaf-by-leaf status

Status key: **Real** = working page on live data. **Placeholder** = generated "Coming Soon" screen.

### Medical — `/health/medical` (17 leaves)

| Leaf | Path | Status | Backing data |
|---|---|---|---|
| Dashboard | `/health/medical/dashboard` | Placeholder | none |
| Patients | `/health/medical/patients` | Placeholder | none |
| Staff | `/health/medical/staff` | Placeholder | none |
| Supplies | `/health/medical/supplies` | Placeholder | none |
| First Aid | `/health/medical/first-aid` | Placeholder | none |
| Equipment | `/health/medical/equipment` | Placeholder | none |
| Protocols | `/health/medical/protocols` | Placeholder | none |
| Logs | `/health/medical/logs` | Placeholder | none |
| C.H.E.K. | `/health/medical/chek` | Placeholder | none |
| Crew Medical Records | `…/personnel/crew-medical-records` | Placeholder | none |
| Fitness-to-Work / ENG1 | `…/personnel/fitness-to-work-eng1` | Placeholder | `profiles.medical_expiry` only |
| Vaccinations & Immunisations | `…/personnel/vaccinations-and-immunisations` | Placeholder | none |
| Allergies & Conditions | `…/personnel/allergies-and-conditions` | Placeholder | none |
| Medications | `…/personnel/medications` | Placeholder | none |
| Medical Certificates | `…/personnel/medical-certificates` | Placeholder | `crew_certificates` with type `Medical` |
| Next of Kin / Emergency | `…/personnel/next-of-kin-emergency` | Placeholder | `crew_next_of_kin` exists, owned by HRIS |
| Incident & Treatment History | `…/personnel/incident-and-treatment-history` | Placeholder | `medical_reports`, unread by any UI |

### Spa — `/health/spa` (5 leaves)

Dashboard, Calendar, Clients, Treatments, Inventory. All placeholder, no backing data.

### Nutrition — `/health/nutrition` (5 leaves)

Overview, Food Log, Calendar, Goals, Settings. All placeholder, no backing data.

### Physio — `/health/physio` (5 leaves)

Rehab Protocols, Assessments, Treatment Plans, Session Log, Referrals. All placeholder, no backing data.

### Personal Training — `/health/personal-training` (19 leaves)

Trainer: Dashboard, Schedule, Athletes (Roster, Athlete Workspace, Active Programs), Programming (Templates, Exercises, Rehab Protocols, Videos), Admin (Trainers, Sources × 6). Athlete: My Training, Progress, Profile. All placeholder, no backing data.

---

## 4. Substrate gaps

**4.1 Access control.** `health` resolves to the RBAC key `crew_roster`, which every operational role holds. Clinical records need their own resolver. There is no `medical` or `wellness` module row in the `modules` table, no `medical_can_*` SQL helper, and no client-side mirror. `ModuleRoute` supports `hrLevel` and `payrollLevel` only.

**4.2 Subject identity.** HRIS keys employees on `profiles.id`. Health subjects are wider: guests, owner's party and visiting contractors receive treatment and use the spa and gym but have no profile and must never acquire one. A shared subject record that optionally links to a profile is required, or the same person ends up duplicated across five sub-modules.

**4.3 Confidentiality.** `hr_record_type` already contains `medical_record`, and `data_retention_policies` can carry a retention period for it, so the retention substrate exists and is unused. There is no access log for clinical record reads; HRIS has `hr_record_access_log` for the equivalent problem.

**4.4 Expiry and alerts.** `hr_expiry_items` and `hr_generate_alerts()` already turn HR dates into rows in `alerts`. Medical certificate and fitness expiry, vaccination validity, medical stores expiry and equipment service dates are the same shape and should feed the same alert table rather than a parallel mechanism.

**4.5 Types.** `src/integrations/supabase/types.ts` is hand-maintained and already drifts from the live schema. New health tables have to be patched in the same way until the project regenerates types.

---

## 5. Decisions taken for this build

These questions were put to the owner. Work proceeds on the stated default for each; anything marked **assumption** is a judgement call that is cheap to change later.

| Area | Decision |
|---|---|
| Order | All five sub-modules. Medical first (ENG1 / MLC exposure), then Personal Training, Physio, Nutrition, Spa. |
| Sitemap | Treated as the specification. No leaves pruned or renamed. |
| Subjects | One shared subject record per person, optionally linked to a profile. Crew, guest, owner's party, contractor and family are all supported; guests never get a profile. |
| Medical patients | Crew and guests. |
| Spa clients / PT athletes / nutrition subjects | Crew and guests, same subject record. |
| Clinical access | Medical staff, DPA and superadmin see clinical detail. Captains and HR see fitness status, restrictions and expiry only, never diagnosis, medication or consultation notes. Crew see their own record in full. |
| Wellness access | Spa, nutrition, physio and PT are gated on a separate, lower-sensitivity `wellness` module; the subject always sees their own records. |
| RBAC | Two new modules seeded: `medical` (sensitive) and `wellness`. `health` navigation maps to `wellness`; medical routes additionally require `medical`. |
| Retention | Existing `medical_record` retention policy, default 7 years, registered through `hr_register_record` like every other HR record. |
| Supplies | Full stock control with locations, batch and expiry, minimum levels, and a controlled-drugs register requiring a named witness on every movement. |
| Fitness-to-Work | A dedicated assessment record for status, restrictions and expiry, linked to the existing `crew_certificates` row so current expiry alerts and the HRIS compliance strip keep working. |
| Allergies | Owned by Medical, read by Nutrition, so the galley sees one truth. |
| Rehab protocols | One library, surfaced under both Physio and PT Programming. |
| Exercise sources | wger implemented end to end (free, no key). ExerciseDB implemented behind a key stored per company. MuscleWiki, AnatomyTOOL and Z-Anatomy have no usable public API and are implemented as attributed manual / file import. |
| Telemedicine | Recorded on the consultation (provider, case reference), no integration. |
| Wearables | Out of scope for this pass. |
| **C.H.E.K. (assumption)** | Built as a configurable health screening and appraisal programme: versioned questionnaire templates with scored sections, campaigns, per-person results and follow-up actions. This holds a CHEK-style holistic health appraisal or any other crew screening programme. Confirm the intent and the page can be re-pointed without schema change. |
| Delivery | Migrations written to `supabase/migrations`, applied to the live project by the owner or Lovable, exactly as HRIS was. Generated types hand-patched in the same pass. |

---

## 6. Build plan

Each phase lands on this branch and leaves lint, typecheck, tests and build green.

1. **Foundation** — access resolvers in SQL and TypeScript, RBAC module seeds, shared subject and measurement tables, company health settings, referrals, clinical access log, expiry view and alert generation, module route gating, shared page components, sitemap gating.
2. **Medical** — 17 pages: dashboard, patients, staff, supplies, first aid, equipment, protocols, logs, screening, and the eight personnel record views.
3. **Personal Training** — 19 pages: trainer dashboard and schedule, athlete roster and workspace, programme templates and assignment, exercise library, source importers, videos, trainer admin, and the athlete-facing trio.
4. **Physio** — 5 pages: assessments, treatment plans, session log, referrals, shared rehab protocol library.
5. **Nutrition** — 5 pages: overview, food log, meal calendar, goals, settings.
6. **Spa** — 5 pages: dashboard, booking calendar, clients, treatment menu, inventory.
7. **Close-out** — module documentation, tests, go-live checklist.
