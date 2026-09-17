# HRIS module

The HRIS module lives under `src/modules/hris` and the `/hris/*` routes (plus the HR dashboard at `/hr`). It replaces the earlier "Coming Soon" placeholders and the data-less `/hr` shell. This document is the map: what each area does, how access works, what the database looks like, and what has to happen on the live project before it is switched on.

## Areas

| Area | Route | What it does |
|---|---|---|
| HR Dashboard | `/hr` | KPIs, "needs attention" feed (expiries, reviews, objectives, warnings), headcount breakdowns, recent HR activity, data governance (retention policies vs live record counts, GDPR requests, archive, export). |
| Employee Records › Personal Details | `/hris/employee-records/personal-details` | Full profile editor keyed on `profiles.id`, avatar upload, field-level access, audit trail. |
| Employee Records › Contracts & Employment | `/hris/employee-records/contracts-and-employment` | `crew_contracts` (SEA) lifecycle: draft → active → expired/terminated/superseded, signed document, company expiry overview. |
| Employee Records › Documents & Certificates | `/hris/employee-records/documents-and-certificates` | Crew certificates, attachments, travel documents, compliance strip, company expiry overview. |
| Employee Records › Next of Kin | `/hris/employee-records/next-of-kin-emergency` | `crew_next_of_kin` ICE contacts with consent; crew with none recorded. |
| Employee Records › Employment History | `/hris/employee-records/employment-history` | Timeline of assignments, contracts and rank changes; sea-service summary; CSV. |
| Compensation › Salaries & Compensation | `/hris/compensation/salaries-and-compensation` | `crew_compensation` (base, frequency, allowances, gratuity points, pay grade), bank details (audited). |
| Compensation › Payroll | `/hris/compensation/payroll` | Pay periods → payroll runs → `payroll_calculate_run` → adjust → approve → paid; payslip PDFs. |
| Compensation › Gratuities | `/hris/compensation/gratuities` | Gratuity pools split by equal / points / days / points×days via `gratuity_calculate_pool`; approved pools flow into payroll. |
| Compensation › Pay Reviews | `/hris/compensation/pay-reviews` | Proposals with change %, approval, `pay_review_apply` creates the new compensation row. |
| Compensation › Settings | `/hris/compensation/compensation-settings` | Company pay settings, pay grades, FX rates, pay periods. |
| Performance › Annual Evaluations / Annual Reviews / End of Rotation | `/hris/performance/*` | One review engine (`performance_reviews`) with competency ratings, self-assessment, sign-off and crew acknowledgement. |
| Performance › Objectives & PDPs | `/hris/performance/objectives-and-pdps` | `crew_objectives` with weighted progress, updates, links to development courses. |
| Performance › Disciplinary Matters | `/hris/performance/disciplinary-matters` | `disciplinary_records` with severity, stage ladder, expiry, appeals, restricted investigation file. HR editors only; every view is audited. |
| Recruitment › Vacancies / Candidates | `/hris/recruitment/*` | Requisitions, candidate pool, pipeline, interviews, hire → creates the crew profile and starts onboarding. |
| Recruitment › Onboarding | `/hris/recruitment/onboarding` | Joiner readiness (contract, documents, NOK, pay, bank, invitation, pre-departure, familiarisation) plus the HR induction checklist. |
| Leave & Rotation | `/crew/leave*`, `/crew/rotation-planner` | Existing leave planner, requests, calculator and rotation planner, now owned by HRIS in navigation. |
| Training & Development | `/development` | Existing development module. |
| Compliance & Right to Work | `/hris/compliance-and-right-to-work` | Company compliance matrix (passport, visa, medical, work authorisations, certificates), per-crew documents, alert refresh. |
| Reporting & Analytics | `/hris/reporting-and-analytics` | Headcount, joiners/leavers, turnover, tenure, expiry forecasts, mix, review completion, leave, onboarding; CSV/PDF. |

## Access model

Two resolvers, each mirrored in SQL and TypeScript so the UI and RLS agree:

- **HR** (`hr_can_view` / `hr_can_edit` / `hr_can_admin` in SQL; `resolveHrAccess` in `src/modules/auth/lib/hrAccess.ts`): admin = superadmin, DPA (RBAC or legacy `profiles.role` dpa / shore_management); edit = fleet_master, captain, purser, RBAC `hr` edit, legacy master; view = chief officer, chief engineer, HOD, RBAC `hr` view; self = crew (or RBAC `hr` with scope `self`). Auditors have nothing.
- **Finance / payroll** (`payroll_can_*`; `resolvePayrollAccess` in `src/modules/auth/lib/payrollAccess.ts`): admin = superadmin, DPA; edit = purser, RBAC `finance` edit; view = fleet_master, RBAC `finance` view. Captains and HODs never see salaries.

`ModuleRoute` (`src/shared/components/ModuleRoute.tsx`) gates every HRIS route on login + module access, and optionally `hrLevel` / `payrollLevel`. Sidebar leaves carry `moduleKey` / `minPermission` and are filtered by the same resolvers. HRIS never fails open while RBAC is loading.

The HRIS employee key is **`profiles.id`**, not `user_id`: imported crew exist before they have a login. Tables that predate HRIS (`crew_assignments`, `crew_certificates`, `crew_attachments`, leave entries, rotation assignments) still key on `user_id`; the pages show a notice for crew without an account where that matters.

## Data

Migrations, in order (all under `supabase/migrations`):

1. `20260917100000_hris_phase0_substrate.sql`: HR helpers, profile update policy for HR managers, role-gated crew_assignments / certificates / attachments writes, familiarisation trigger.
2. `20260917110000_hris_phase1_employee_records.sql`: `crew_contracts`, `crew_next_of_kin`, `hr_record_metadata.profile_id`, `hr_register_record`, `hr_expiry_items` view, notification types.
3. `20260917110500_hris_avatars_bucket.sql`: public `avatars` bucket.
4. `20260917113000_hris_phase1_followups.sql`: HR audit-log read policy, `profiles.visa_expiry`, nightly contract expiry.
5. `20260917120000_hris_phase2_compensation.sql`: `finance` module, `hr_company_settings`, `fx_rates`, `pay_grades`, `crew_compensation`, `crew_bank_details`, `pay_periods`, `gratuity_*`, `payroll_*`, `pay_reviews`, `hr_days_onboard`, `payroll_calculate_run`, `gratuity_calculate_pool`, `pay_review_apply`.
6. `20260917130000_hris_phase3_performance.sql`: competencies, review cycles, `performance_reviews`, `crew_objectives`, `disciplinary_records`, `incident_involved_persons`, `hr_performance_due_items` view, subject RPCs.
7. `20260917140000_hris_phase4_recruitment_onboarding_rtw.sql`: `vacancies`, `candidates`, applications, interviews, `recruitment_hire_candidate`, onboarding templates/records/items, `crew_work_authorisations`, `hr_generate_alerts`.
8. `20260917150000_hris_phase5_retention.sql`: `hr_archive_due_records`, `hr_anonymize_profile`, `hr_record_access_log`, crew gratuity visibility.

Money is stored as integer minor units with an ISO-4217 code. Every HR record is registered in `hr_record_metadata` by trigger with a retention end date from `data_retention_policies`.

Storage: crew documents go to the private `documents` bucket under `<company_id>/crew/<crew_user_id>/<kind>/…` (`src/lib/storage/crewDocuments.ts`) and are read through signed URLs. Candidate CVs use `<company_id>/recruitment/<candidate_id>/…`.

## Engines

- **Days onboard**: `hr_days_onboard(profile, start, end, vessel?, unpaid_codes?)` classifies each day from leave entries (F/Q onboard, T/CD travel, U unpaid…) → rotation planner blocks → crew assignments → active contract.
- **Payroll**: `payroll_calculate_run(run)` prorates the monthly base by paid days (unpaid leave, and travel when the company says travel is unpaid), prorates recurring allowances, attaches approved gratuities whose pool period ends in the pay period, converts to the run currency with `fx_rate_for`, and totals the run. `src/modules/hris/lib/payroll/engine.ts` mirrors it for previews and is unit-tested.
- **Gratuities**: `gratuity_calculate_pool(pool)` weights eligible crew by the chosen method, floors shares and gives the remainder to the largest weight so the pool sums exactly.
- **Alerts**: `hr_generate_alerts()` turns `hr_expiry_items` (≤90 days) and `hr_performance_due_items` (≤14 days) into rows in the existing `alerts` table, idempotently, and auto-dismisses alerts whose item was renewed or completed.

## Go-live checklist

1. Apply the migrations to the live Supabase project in order. The three earlier hand-written migrations (`20260228120000_create_feedback_submissions.sql`, `20260501100000_work_rest_module.sql`, `20260501210000_leave_management_upgrade.sql`) must already be applied; the leave pages depend on them.
2. Regenerate `src/integrations/supabase/types.ts` from the live project (`supabase gen types typescript --project-id pfvtrtkqkvjbnbaabgpv > src/integrations/supabase/types.ts`). The file was hand-patched for the new tables and will drift from the live schema otherwise.
3. Schedule the daily jobs. With `pg_cron` enabled the migrations schedule them; otherwise call the `hr-daily-sweeper` edge function once a day with the service-role key (or set `HR_SWEEPER_SECRET` and use that as the bearer token).
4. Deploy the edge functions `update-familiarization` (rewritten) and `hr-daily-sweeper`.
5. Review the seeded `role_permissions` for the `finance` module and the default `pay_grades`, `performance_competencies` and `onboarding_templates` rows per company; adjust in Compensation Settings, the HR dashboard and Onboarding respectively.
6. Set `hr_company_settings` per company (default currency, pay period, cutoff, unpaid leave codes, gratuity method).
7. Confirm the `documents` and `avatars` bucket policies exist (the migrations create the avatars bucket; `documents` predates HRIS).

## Testing

`npm run check` runs lint, typecheck and the unit tests. HRIS-specific suites: `src/test/lib/hrAccess.test.ts`, `src/test/lib/payrollAccess.test.ts`, `src/test/config/sitemap.test.ts`, `src/modules/hris/lib/**/*.test.ts`, `src/modules/crew/services/leaveCalculator*.test.ts`.
