
# Crew Training Module — Gap Analysis

Comparing the current `src/modules/development` implementation against `Sealogical_Crew_Training_Module_Feature_Specification.pdf` (June 2026). Status legend: **OK** = already matches, **GAP** = missing/wrong, **PARTIAL** = exists but needs change. No code changes are made in this step.

## 1. Information architecture & navigation

| Spec | Today | Status |
|---|---|---|
| Menu item **"Crew Training"** under Crew, gated like Hours of Rest (own view always; all-crew requires permission) | Module lives under `Crew Development` with `MyDevelopment`, `Applications`, `Catalogue`, `Admin`, `Courses Register` | PARTIAL — rename to "Crew Training", collapse to: *My Training*, *Crew Training* (gated all-crew view), *Course Catalogue*, *Fleet Settings* |
| Each row in the all-crew view opens full application + approval history | `CoursesRegister` exists but is fleet-admin only; no per-row history yet | GAP |
| Live reimbursement status per row (pending → calculated → 50% reimbursed → fully reimbursed) | Not displayed; current statuses are application-level only | GAP |

## 2. Approval workflow

Spec: **Crew → HOD → Captain (or Purser acting for Captain) → Course → Completion → Reimbursement**.

| Spec | Today | Status |
|---|---|---|
| Single HOD step | `hod_review` exists | OK |
| Single Captain/Purser step | `captain_review` exists | OK |
| **No peer-review step** | `peer_review` exists in enum, hooks, UI, and config (`APPLICATION_STATUS_CONFIG`, `APPROVAL_STEPS`) | GAP — remove `peer_review` across enum, statuses, stages, UI |
| Denials carry explanation + suggested alternative | Comments exist; "suggested alternative" field missing | GAP — add `suggested_alternative` text on decisions |
| Notifications at every step | Not wired through `alerts`/notification system | GAP |
| Pursers can act in Captain's place | No purser-as-captain delegation | GAP — allow Purser RBAC role to action Captain queue |

## 3. Eligibility rules

Spec: permanent contract • 90 days served • probation passed • 30-day+ courses only after first employment anniversary • new permanent crew can apply for Professional/Extracurricular day one (reimbursement contingent on probation) • no reimbursement for courses before employment started.

| Today | Status |
|---|---|
| `ELIGIBILITY_MONTHS = 12` applied as a single gate in `MyDevelopment` | GAP — replace with: 90-day service check, probation check, 30-day-course anniversary check; warnings (not hard blocks) that approvers can override; persisted `discretionary_justification` already exists ✓ |
| Contract type / probation fields read from profile | Not present | GAP — needs `profiles.contract_type`, `profiles.probation_end_date` (or fall back to contract_start + 90 days) |

## 4. Course catalogue

| Spec | Today | Status |
|---|---|---|
| ~290 courses, seeded from March 2026 catalogue | 20 rows in `development_courses` | GAP — seed full catalogue, add `catalogue_number` ordering ✓ already exists |
| Selecting a course auto-applies category, day-type, reimbursement terms | Category copied; day-type/reimbursement rules not derived | GAP |
| "Course not listed" option lets crew propose new courses | `is_custom_course` exists on application | OK — needs review-side surfacing |
| Stores renewal interval per course | `renewal_period` text column exists | OK (future renewal-alert engine deferred per spec) |
| Catalogue manager in Fleet Settings (add/edit/recategorise/retire) | No admin UI | GAP |

## 5. Policy / rules engine

Spec table (per category):

```text
                Inkfish Required   Mandatory     Professional   Extracurricular
Fees            100% upfront       100% reimb.   100% reimb.    100% reimb.
>$4,000         n/a                50/50 split   50/50 split    —
Accom.          Vessel             $250/night    $250/night     none
Flights         Vessel             Business      Business       none
Course days     Working            Working       Neutral        no credit
Travel days     Neutral            Neutral       Neutral        no credit
Per diem        $50/day            —             —              —
Clawback 12mo   Exempt             Exempt        Applies        Applies
Initiated by    HOD/mgmt           Crew          Crew           Crew
```

| Today | Status |
|---|---|
| Constants exist: `ACCOMMODATION_CAP_PER_NIGHT=250`, `FOOD_PER_DIEM_FLEET_ORGANISED=50`, `PROFESSIONAL_THRESHOLD=4000`, `CLAWBACK_MONTHS=12` | OK |
| Category enum uses `fleet_organised` instead of `inkfish_required` | PARTIAL — rename label only ("Inkfish Required"); DB enum value can stay or be migrated |
| Automatic reimbursement calculation (cap, split, per diem) | Partial in generated columns; needs rewrite to honour full matrix | GAP |
| Constants are **admin-editable settings**, not hard-coded | All hard-coded | GAP — move to a `program_settings` table |
| Online courses → neutral days at 1 day/8h, HOD-overridable | Not implemented | GAP |
| One currency per application; USD for fleet reporting | Single-currency assumption today; no FX | GAP — add `application_currency`, store `*_local` and `*_usd` |
| Estimate overruns flagged for explanation | Already required in `ExpenseClaimModal` | OK |

## 6. Reimbursement / clawback

| Spec | Today | Status |
|---|---|---|
| Clawback watch-list (auto-tracked, 12-month window, Required/Mandatory exempt) | Constant only, no watch-list view | GAP — derived view in Fleet Settings |
| App calculates what's owed; does **not** move money | Matches scope | OK |
| Reimbursement payments stay in CrewMate/payroll | Matches scope | OK |

## 7. Leave-calendar integration

| Spec | Today | Status |
|---|---|---|
| Approved applications create training working-day, neutral-day and travel-day entries on the leave calendar | Not wired | GAP — on transition to `approved`, insert `crew_leave_entries` for course window and travel days |
| Leave **balances** not auto-adjusted in v1 | Naturally matches | OK |

## 8. Fleet Settings & reporting

| Spec | Today | Status |
|---|---|---|
| Fleet-wide USD cost dashboard (vessel / dept / category / month; estimated vs actual) | `DevelopmentAdmin` has charts but not the full breakdown | PARTIAL — extend with vessel × dept × category × month grid + USD totals |
| Monthly report (generated summary, CSV / print-to-PDF, "mark as reported" audit action) | Not present | GAP |
| Program settings UI (caps, per diem, mileage, $4,000 threshold) | Not present | GAP |
| Mileage rates default $0.70/mi, $0.44/km, editable | Not present | GAP |
| Clawback watch-list | Not present | GAP |

## 9. Out of scope (per spec, do **not** build now)

- Payment movement (stays in CrewMate/payroll)
- Auto leave-balance arithmetic
- Shoreside HR-instead-of-Captain path
- Structured per-crew development plans (tracker stays a document upload)
- Renewal reminders engine
- Standing CD-team logins

## 10. Recommended refactor order (each its own deliverable)

1. **Schema & catalogue**: drop `peer_review`, rename labels to "Inkfish Required", add `program_settings`, `application_currency`/local-amount columns, `suggested_alternative`, profile `probation_end_date`; seed full March 2026 catalogue.
2. **Rules engine**: category-matrix calculator + eligibility checks (warnings, not blocks) + online-course neutral-day logic.
3. **Application & approval flow**: 2-step HOD→Captain/Purser, alerts at each step, denial with alternative, leave-calendar entries on approve.
4. **Crew Training view** (permission-gated all-crew page) with monthly grouping, filters, history, live reimbursement status.
5. **Fleet Settings**: catalogue manager, USD cost dashboard, monthly report + "mark as reported", clawback watch-list, editable program settings.

Each stage ships with visual proof before the next begins, matching the spec's "What done means" clause.

Confirm the order (or reorder/cut) and I'll start with stage 1.
