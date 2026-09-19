# Health & Wellness module

The Health & Wellness module lives under `src/modules/health` and the `/health/*` routes. It replaces 51 "Coming Soon" placeholders with working pages across five sub-modules: Medical, Spa, Nutrition, Physio and Personal Training. This document is the map: what each area does, how access works, what the database looks like, and what has to happen on the live project before it is switched on.

## Areas

| Area | Route | What it does |
|---|---|---|
| Medical › Dashboard | `/health/medical/dashboard` | Fitness to work across the fleet, stores and equipment readiness, clinical activity over 30 days, and everything overdue or due within 30 days. |
| Medical › Patients | `/health/medical/patients` | Everyone the medic is responsible for, led by severe allergies and fitness state. Guests and the owner's party are added here. |
| Medical › Staff | `/health/medical/staff` | The medical roster and their qualifications. Linking a crew profile here is what grants clinical access. |
| Medical › Supplies | `/health/medical/supplies` | Medical stores with locations, batches and expiry, plus the controlled drugs register. Quantities are maintained by the database on every movement. |
| Medical › First Aid | `/health/medical/first-aid` | Kits and grab bags with inspection intervals and history. |
| Medical › Equipment | `/health/medical/equipment` | AEDs, oxygen, monitors and the rest, with checks, services and defects. |
| Medical › Protocols | `/health/medical/protocols` | Versioned protocol library with per-version crew acknowledgement. |
| Medical › Logs | `/health/medical/logs` | Fridge temperatures, daily checks, oxygen, sharps and telemedicine calls. |
| Medical › C.H.E.K. | `/health/medical/chek` | Configurable crew health screening: questionnaire templates, campaigns, scoring, risk bands and medic review. |
| Personnel › Crew Medical Records | `…/personnel/crew-medical-records` | The clinical summary: blood group, history, practice and insurer, critical alert. |
| Personnel › Fitness-to-Work | `…/personnel/fitness-to-work-eng1` | ENG1 and equivalents, restrictions and expiry, fleet-wide and per person. |
| Personnel › Vaccinations | `…/personnel/vaccinations-and-immunisations` | What is held, what has lapsed and who has nothing recorded. |
| Personnel › Allergies & Conditions | `…/personnel/allergies-and-conditions` | Allergies (shared with the galley under consent) and long-term conditions (never shared). |
| Personnel › Medications | `…/personnel/medications` | Current and past medication, optionally linked to a stores item. |
| Personnel › Medical Certificates | `…/personnel/medical-certificates` | The paperwork, filed in the existing `crew_certificates` table. |
| Personnel › Next of Kin | `…/personnel/next-of-kin-emergency` | Read-only view of the HRIS emergency contacts, with one-tap calling. |
| Personnel › Treatment History | `…/personnel/incident-and-treatment-history` | The consultation log with observations, treatment, outcome and days lost. |
| Spa | `/health/spa/*` | Treatment menu, booking calendar with clash detection, clients and inventory. |
| Nutrition | `/health/nutrition/*` | Per-person targets and food log, vessel meal calendar with allergen clash prompts, goals, and company settings. |
| Physio | `/health/physio/*` | Assessments with structured findings, treatment plans, session log with pain trend, and cross-discipline referrals. |
| Personal Training › Trainer | `/health/personal-training/trainer/*` | Dashboard, schedule, athlete roster and workspace, programme templates, exercise and video libraries, trainer admin, import connectors. |
| Personal Training › Athlete | `/health/personal-training/athlete/*` | My training with a set-by-set workout logger, progress charts and personal bests, profile. |

## Access model

Two resolvers, each mirrored in SQL and TypeScript so the UI and RLS agree.

**Medical** (`medical_can_view` / `medical_can_edit` / `medical_can_admin` in SQL; `resolveMedicalAccess` in `src/modules/auth/lib/medicalAccess.ts`):

- admin: superadmin, DPA, RBAC `medical` admin, legacy `dpa` / `shore_management`
- edit: admin, **an active practitioner with discipline `medical`**, RBAC `medical` edit
- view: edit, RBAC `medical` view
- self: RBAC `medical` with scope `self`, or legacy `crew`

Rank grants nothing. A ship's medic gets clinical access by being on the practitioner roster (`hw_practitioners`), which is why the Staff page states that consequence in the form. Captains, pursers and heads of department are deliberately absent.

**Fitness to work** (`med_fitness_can_view`; `resolveFitnessAccess`) is the one medical surface the bridge and HR can read: medical staff, anyone with HR view, captains and fleet masters. It carries status, restrictions and dates and no clinical detail, which is why fitness lives in its own table rather than on the consultation.

**Wellness** (`wellness_can_*`; `resolveWellnessAccess`) covers spa, nutrition, physiotherapy and training:

- admin: superadmin, DPA, RBAC `wellness` admin, legacy `dpa` / `shore_management`
- edit: admin, anyone with clinical edit, any active practitioner, captain, purser, RBAC `wellness` edit, legacy `master`
- view: edit, fleet master, chief officer, chief engineer, HOD, RBAC `wellness` view
- self: RBAC `wellness` with scope `self`, or legacy `crew`

Physiotherapy notes are the exception inside wellness: they are treated as clinical and gated on medical access, the `physio` discipline or wellness admin (`canAccessPhysio`, and the matching `physio_*` RLS policies).

`ModuleRoute` gains `medicalLevel` and `wellnessLevel` alongside the existing HR and payroll gates. The rule used in `src/modules/health/routes.tsx` is that a page carries a level only when nobody outside that level has business opening it; pages a crew member opens to see their own record carry no level, because the database returns their row and nothing else. Sidebar leaves carry `moduleKey` (`medical` or `wellness`) and `selfServe`, so a crew member keeps their own record and their own training while company-wide pages disappear.

`canAccessModule('health')` resolves through the wellness rules rather than the old `crew_roster` mapping, and never fails open: it returns false until RBAC and the practitioner roster have loaded.

## Data

The health subject is **`hw_people.id`**, not `profiles.id`. Guests, the owner's party and visiting contractors are treated on board but must never get a login, so they exist only here. A database trigger keeps one `hw_people` row per profile in step with `profiles`, and the migration backfills the existing crew. Tables that predate the section (`crew_certificates`, `crew_next_of_kin`) still key on `profiles.user_id` or `profiles.id`; `useHealthPeople` exposes both so those pages can join.

Migrations, in order (all under `supabase/migrations`):

1. `20260919100000_health_phase1_foundation.sql`: RBAC modules `medical` and `wellness`, the access helpers, `hw_practitioners`, `hw_people`, `hw_measurements`, `hw_settings`, `hw_referrals`, `hw_record_access_log`, the profile sync trigger and backfill.
2. `20260919110000_health_phase2_medical.sql`: practitioner qualifications, `med_patient_records`, allergies, conditions, medications, vaccinations, `med_fitness_assessments`, `med_consultations`, stores (locations, items, transactions), equipment, kits, checks, protocols and acknowledgements, log entries, the screening tables, and the engines below.
3. `20260919120000_health_phase3_wellness.sql`: `spa_*`, `nut_*` and `physio_*` tables, the booking clash trigger, the spa stock engine and the food-log macro trigger.
4. `20260919130000_health_phase4_training.sql`: `pt_*` tables, `pt_assign_template`, the set-log trigger.
5. `20260919140000_health_phase5_views_alerts_seeds.sql`: `hw_expiry_items`, `hw_fitness_status`, `hw_generate_alerts`, notification types, and the seed helpers for MCA MSN 1768 Category A stores, the default screening template, the spa treatment menu and the exercise connectors.

## Engines

- **Stock**: `med_supply_apply_transaction` applies every movement, refuses to let stock go negative, and refuses an unwitnessed controlled drug issue, disposal or adjustment when the company requires a witness. A `stock_check` states the counted quantity in `quantity_delta` and the trigger rewrites it as the delta, so a count and a movement use one code path. `spa_inventory_apply_transaction` does the same for the spa.
- **Consultation numbers**: `med_consultation_number` generates `MC-<year>-<sequence>` per company, with a unique index so a race raises rather than duplicating.
- **Fitness**: `med_fitness_after_write` mirrors the latest valid expiry onto `profiles.medical_expiry` and registers the record for retention, so the crew list, certificate alerts and the HRIS compliance strip stay right without a second source of truth.
- **Checks**: `med_kit_check_after_insert` rolls the next due date forward from the interval and marks a failed item defective.
- **Bookings**: `spa_booking_check_clash` refuses to double book a therapist or a room; cancelled and no-show bookings release the slot.
- **Programmes**: `pt_assign_template` snapshots a template into `pt_program_sessions` and `pt_session_items`, so editing a template never rewrites an athlete's history.
- **Macros**: `nut_food_log_fill_macros` recalculates a log line's calories and macros from the food library and the quantity, so totals cannot drift from the library.
- **Alerts**: `hw_generate_alerts()` turns `hw_expiry_items` into rows in the existing `alerts` table with `source_module` `health`, honouring the per-company warning windows in `hw_settings`, and auto-dismisses alerts whose item was renewed or removed.

Retention: clinical records are registered in `hr_record_metadata` as `medical_record` through the existing `hr_register_record`, so the HRIS retention and GDPR tooling already covers them. `hw_record_access_log` records clinical reads, readable by medical admins, HR admins and the subject.

## Exercise import

`supabase/functions/pt-exercise-import` imports into `pt_exercises` from wger or ExerciseDB. It runs server side for one reason: the ExerciseDB connector needs a RapidAPI key, and that key must never reach the browser. It is held in `pt_exercise_sources.credential`, a table only a wellness admin can read, and used only in that function. wger needs no key and is licensed CC-BY-SA 4.0, which the imported rows carry as attribution.

MuscleWiki, AnatomyTOOL and Z-Anatomy have no usable public API, so those connectors are file imports: upload a JSON or CSV export, map the columns and confirm you are licensed to use it.

## Assumptions to confirm

- **C.H.E.K.** is built as a configurable health screening and appraisal programme: versioned questionnaire templates with scored sections, campaigns, per-person results and medic review. Confirm the intended meaning and the page can be re-pointed without a schema change.
- **MSN 1768 Category A** stores are seeded as a starting point with quantities at zero for the medic to count in. Review against the vessel's flag requirement before relying on it.

## Verified against a real database

The migrations were applied to a local PostgreSQL 16 and the engines exercised against it, which is how three defects were caught and fixed. What was proved to work:

- A new or changed profile flows through to its health subject.
- Stock cannot go negative, and a controlled drug cannot be issued, disposed of or adjusted without a named witness.
- A stock check records the counted quantity and the balance follows.
- Consultation numbers sequence per company and year.
- A fitness certificate mirrors its expiry onto `profiles.medical_expiry`, and the fitness view resolves the right state.
- Clinical writes register for retention in `hr_record_metadata`.
- An overlapping spa booking is refused.
- Food log macros come from the food library.
- Assigning a template snapshots it, and editing the template afterwards leaves the athlete's programme untouched.
- `hw_generate_alerts` raises the right alerts and raises nothing on a second run.

Two pre-existing HRIS issues surfaced during that replay and are **not** fixed here, because they belong to that module:

- `hr_generate_alerts` compared a uuid column against text and therefore never raised an HR alert. This one **is** fixed, in `20260919150000_fix_hr_generate_alerts_uuid.sql`, because the health generator was built from it and shares the `alerts` table.
- `20260917113000_hris_phase1_followups.sql` and `20260917150000_hris_phase5_retention.sql` both fail to replay from scratch on the same uuid-against-text mistake in the `audit_logs` policy (`m.record_id::text = audit_logs.entity_id`, where both columns are uuid). The live project is unaffected, because the Lovable copies applied later create a working version of that policy, but a clean rebuild of the database would stop there. Worth correcting when HRIS is next touched.

## Go-live checklist

1. Apply the five migrations to the live Supabase project in order, after the HRIS migrations.
2. Regenerate `src/integrations/supabase/types.ts` from the live project (`supabase gen types typescript --project-id pfvtrtkqkvjbnbaabgpv > src/integrations/supabase/types.ts`). The file is hand-patched for the new tables, views and functions and will drift otherwise.
3. Deploy the edge function `pt-exercise-import`.
4. Add `hw_generate_alerts` to the daily sweep, alongside the HR alert generation. The HR generator starts working again with the same deployment, so expect a backlog of HR alerts on its first run.
5. Put the ship's medics on the practitioner roster at Medical › Staff and link their crew profiles. Nobody has clinical access until this is done, including the DPA's own medic.
6. Review the seeded `role_permissions` for the `medical` and `wellness` modules per company.
7. Set `hw_settings` per company: units, warning windows, telemedicine provider, controlled drug witnessing, spa hours.
8. Seed the starting data you want from the pages themselves: Category A stores per vessel, the screening template, the spa treatment menu and the exercise connectors.

## Testing

`npm run check` runs lint, typecheck and the unit tests. Health-specific suites: `src/test/lib/medicalAccess.test.ts`, `src/test/lib/wellnessAccess.test.ts`, and the Health invariants in `src/test/config/sitemap.test.ts`, which assert that every sitemap leaf is gated and that `HEALTH_PATHS` matches the sitemap exactly, so a new leaf cannot silently fall back to a placeholder.
