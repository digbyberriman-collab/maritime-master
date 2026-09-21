# Phase 1 Discovery — Edge functions & API surface (agent adfc549793f5c40c6)


# STORM Platform Audit — Phase 1: Discovery & Mapping (API / Edge-Function layer)
Read-only inventory. No files were modified.

## Factual data summary

| Metric | Count |
|---|---|
| Edge functions on disk (`supabase/functions/*/index.ts`, excl. `_shared`) | **27** |
| Functions with `verify_jwt = false` in `supabase/config.toml` | **26** |
| Functions with **no** `verify_jwt` entry at all (config drift) | **1** (`pt-exercise-import`) |
| Functions with a manual (in-code) auth substitute | 21 of 27 |
| Functions with **no** auth check of any kind | **6** (`ai-route-planner`, `extract-flight-data`, `extract-form-fields`, `geocode-search`, `send-email`, and `submit-form` has JWT-only with no role/tenant check) |
| Distinct client-side `.rpc(...)` calls in `src/` | **48** |
| RPC calls with **no** matching function created in `supabase/migrations/*.sql` | **1** (`next_reference` — 3 call sites) |
| Distinct literal `.from('table')` / `.from("table")` references in `src/` | **299** |
| `.from()` references with **no** matching table/view in `src/integrations/supabase/types.ts` | **84** (53 health-module, 30 refit-module, 1 `feedback_submissions`) |

Note on the prior audit's premise: it is now **wrong** to say "all 26 functions have verify_jwt=false" — there are 27 functions, and `pt-exercise-import` (added since) has no config entry at all, so its platform-level JWT enforcement is whatever Supabase's unset default is (normally `true`), unlike its 26 siblings.

---

## 1. Edge function inventory

| Function | Purpose (one line) | verify_jwt | Manual auth in code |
|---|---|---|---|
| accept-invitation | Sets password + clears `invitation_token` for a crew invite | false | none by design (public, token-gated) |
| admin-actions | PIN set/verify + admin actions (reset account, toggle access, reassign vessel) | false | JWT + dpa/superadmin role |
| ai-route-planner | AI-generates a yacht itinerary via Lovable gateway | false | **none** |
| airtable-sync | Two-way crew profile sync with Airtable | false | JWT, company-scoped |
| ais-refresh | Refreshes vessel AIS positions (mock/real provider) | false | JWT+role OR `x-system-key` |
| bulk-invite | Sends up to 50 crew invitations | false | JWT + role |
| complete-drill | Records a completed drill + deficiencies/CAPAs | false | JWT + role |
| create-crew-member | Creates auth user + profile for new crew | false | JWT + role |
| external-api | 3rd-party API gateway (employer/auditor/agent) keyed by `x-api-key` | false | bcrypt-hashed API key (token-based, see §2) |
| extract-flight-data | OCRs a travel document via AI vision | false | **none** |
| extract-form-fields | OCRs/parses a form template into field defs via AI | false | **none** |
| generate-travel-letter | Generates a travel-authorization letter | false | JWT + role |
| geocode-search | Proxies OpenStreetMap Nominatim | false | none (no sensitive data) |
| hr-daily-sweeper | Cron housekeeping: expire contracts, generate HR alerts | false | shared secret only (see §2) |
| idea-sync | Syncs defects/equipment from IDEA Marine PMS | false | JWT+role OR `x-system-key` |
| inbound-webhook | Generic external webhook → crew/vessel/document/incident upsert | false | webhook secret (see §2) |
| notify-shipping-master | Notifies shipping master of an incident | false | JWT + role |
| parse-crew-csv | Validates/imports a crew CSV | false | JWT + role |
| pt-exercise-import | Imports PT exercises from wger/ExerciseDB | **unset** | JWT, relies on RLS via a user-scoped client (well-designed) |
| review-certificate | DPA approves/rejects/renews a certificate | false | JWT + role=dpa |
| send-email | Sends a templated transactional email via Resend | false | **none** |
| send-invitation | Sends a single crew invitation | false | JWT + role |
| send-to-agent | Marks a flight request sent to a travel agent | false | JWT + role |
| sign-submission | Signs/rejects an SMS form submission | false | JWT + is-required-signer (PIN check is a no-op, see below) |
| submit-form | Creates a new SMS form submission | false | JWT only — no role/tenant check |
| update-crew-assignment | Updates/reassigns a crew vessel assignment | false | JWT + role + company check |
| update-familiarization | Marks a familiarization checklist item complete | false | JWT + supervisor-or-manager check |

---

## 2. Findings

### EDGE-FN — pt-exercise-import missing from config.toml (config drift)
Severity: Medium
Location: `supabase/config.toml`; `supabase/functions/pt-exercise-import/index.ts`
Description: 27 functions exist on disk but only 26 have a `[functions.<name>]` block. `pt-exercise-import` has none, so it doesn't share the explicit `verify_jwt = false` every other function has — it will use Supabase's unset default (normally `true`).
Impact: Inconsistent platform-level auth behavior across an otherwise uniform fleet of functions; deploy tooling/runbooks that assume "every function is `--no-verify-jwt`" (this repo's own `MIGRATION-PLAN.md` §Stage 4 does) will silently miss it, causing environment-dependent 401s.
Suggested fix: Add an explicit `[functions.pt-exercise-import]` block with the intended `verify_jwt` value.

### EDGE-FN — send-email is an open, unauthenticated relay
Severity: Critical
Location: `supabase/functions/send-email/index.ts`
Description: No Authorization header or caller-identity check anywhere. Any caller can POST `{to, template, variables, idempotencyKey}` and have the company's Resend account send any of 6 templates — including `PASSWORD_RESET` and `ALERT_ESCALATION`, whose only content is attacker-supplied variables (`reset_link`, `action_link`) — to any address, from the real `noreply@storm-maritime.com` sender.
Impact: Turns the app into a phishing/spam relay usable by anyone, at no cost to the attacker, no rate limit, damaging sender reputation and enabling credible-looking phishing using the company's real domain.
Suggested fix: Require/validate a caller JWT like every other notification-sending function already does; restrict templates by caller role; add per-caller/per-recipient rate limiting.

### EDGE-FN — extract-flight-data / extract-form-fields are unauthenticated
Severity: High
Location: `supabase/functions/extract-flight-data/index.ts`; `supabase/functions/extract-form-fields/index.ts`
Description: Neither checks for a caller identity. `extract-flight-data` accepts a `filePath` and downloads it via the **service-role key** from the private `crew-travel-documents` bucket, then returns passenger name/passport-adjacent data — no ownership check. `extract-form-fields` `fetch()`s any attacker-supplied `file_url` with no host allow-list (unlike `pt-exercise-import`'s `ALLOWED_HOSTS` pattern) — an open SSRF primitive — and has no auth either.
Impact: Unauthenticated PII disclosure; SSRF from Supabase's edge network; unmetered AI-cost DoS on both.
Suggested fix: Require caller JWT + ownership/company check before storage download; add a host allow-list to the outbound fetch in `extract-form-fields`; rate-limit both.

### EDGE-FN — ai-route-planner has no auth check
Severity: Medium
Location: `supabase/functions/ai-route-planner/index.ts`
Description: No Authorization header read anywhere.
Impact: Unmetered LLM-cost exposure to anonymous callers on the shared `LOVABLE_API_KEY`.
Suggested fix: Require caller JWT + quota.

### EDGE-FN — sign-submission's "PIN" signing method never validates the PIN
Severity: Critical
Location: `supabase/functions/sign-submission/index.ts` (~lines 85–97)
Description: When `signatureMethod === 'PIN'`, the code only checks whether `signature_pin_hash` *exists*; it never compares `body.pin` against it (no call to anything like `admin-actions.ts`'s working `verifyPin()`). Any required signer can submit any/no PIN and have it recorded as a validly PIN-signed signature.
Impact: This backs an ISM/SMS compliance e-signature trail (`sms_submissions`/`sms_required_signers`) — the "PIN-verified" signature currently has zero more integrity than an unauthenticated click, undermining the audit trail the feature exists for.
Suggested fix: Reuse `admin-actions.ts`'s `hashPin`/`verifyPin` (PBKDF2) pair to actually check `body.pin`, rejecting the signature on mismatch or missing PIN.

### EDGE-FN — submit-form has no role or tenant (vessel/company) check
Severity: Medium
Location: `supabase/functions/submit-form/index.ts`
Description: Confirms the caller has *a* profile but never verifies `body.vesselId` belongs to `profile.company_id` before inserting.
Impact: Any authenticated user of any company can create a submission cross-referencing another company's vessel, corrupting per-vessel data/reference-numbering across tenants.
Suggested fix: Look up the vessel's `company_id` and reject on mismatch, mirroring `generate-travel-letter`/`send-to-agent`/`notify-shipping-master`.

---

## 3. Public / token-based flows

### PUBLIC-FLOW — inbound-webhook: unused signature check + plaintext secret storage
Severity: Critical
Location: `supabase/functions/inbound-webhook/index.ts`; `supabase/migrations/20260201210906_ae961fd0-2473-4dd9-b7a2-16c45a5ba983.sql` (`webhook_secret TEXT NOT NULL`)
Description: Three compounding issues on the one endpoint explicitly meant for unauthenticated external callers: (1) an `x-webhook-signature` header is read and `crypto` is imported, but **never used again anywhere in the file** (confirmed via grep) — dead code that looks like HMAC verification but isn't; (2) the only real auth is `.eq('webhook_secret', webhookSecret)` against a plaintext `TEXT` column — the shared secret is stored and matched unhashed; (3) no rate limiting on secret-guessing (only an optional, often-unset IP allow-list).
Impact: If `webhook_secret` ever leaks (backup, log, screenshot, future SQLi), an attacker gets full forge capability for that company's crew/vessel/document/incident writes with no secondary check, since the "signature" is decorative.
Suggested fix: Hash `webhook_secret` at rest and compare hashes; actually verify `x-webhook-signature` as an HMAC-SHA256 of the raw body; add rate limiting per config id.

### PUBLIC-FLOW — hr-daily-sweeper / ais-refresh / idea-sync: shared secret compared with plain `===`/`!==`
Severity: Medium
Location: `supabase/functions/hr-daily-sweeper/index.ts:25`; `supabase/functions/ais-refresh/index.ts:121`; `supabase/functions/idea-sync/index.ts:157`
Description: All three compare a raw bearer/`x-system-key` value against `SUPABASE_SERVICE_ROLE_KEY`/`SYSTEM_API_KEY` with plain string `!==`/`===` — not constant-time (unlike `admin-actions.ts`'s hash-then-compare PIN, or `external-api.ts`'s `bcrypt.compare`). No rate limiting on any of the three.
Impact: Theoretical timing side-channel on a long-lived shared secret reused across cron/system integrations; more concretely, a leaked `SYSTEM_API_KEY` bypasses the JWT-based company scoping entirely in `ais-refresh`/`idea-sync` (the company filter is only applied when auth came from a JWT, not from the system key), granting cross-tenant access.
Suggested fix: Use a constant-time compare; add lockout/rate limiting on system-key failures; consider a per-company key instead of one global `SYSTEM_API_KEY`.

### PUBLIC-FLOW — accept-invitation / external-api: no rate limiting
Severity: Low
Location: `supabase/functions/accept-invitation/index.ts`; `supabase/functions/external-api/index.ts`
Description: `accept-invitation`'s `invitation_token` is a 122-bit `crypto.randomUUID()` (generated client-side in `src/lib/api/hooks/useUsersApi.ts`) so brute force is infeasible, but there's no attempt/lockout limiting regardless. `external-api` bcrypt-compares the presented key against *every* active `api_keys` row per request — safe against timing attacks per-key, but with no rate limit this is a cheap CPU-exhaustion lever that scales with the number of provisioned keys.
Impact: Low likelihood of secret compromise, but no defense-in-depth against automated guessing/DoS.
Suggested fix: Add a `failed_attempts`/`locked_until` pattern (already used for `admin_pins`) to both.

### PUBLIC-FLOW — secret logging (checked, clean)
Severity: Cosmetic / informational
Location: all 27 functions
Description: Reviewed every `console.log`/`console.error` call in all 27 functions. None print a raw token, PIN, password, API key, or webhook secret; several have explicit comments not to (`external-api.ts`: "do not log the key itself"; `admin-actions.ts`: "don't log the PIN").
Impact: None — this part of the checklist is clean.
Suggested fix: None; keep the convention on new public endpoints.

---

## 4. RPC call inventory vs migrations

### RPC — next_reference is a dead client call (name + signature mismatch)
Severity: High
Location: `src/modules/refit/pages/change-orders.tsx:314`; `src/modules/refit/pages/crew-requests.tsx:243`; `src/modules/refit/components/SimpleModule.tsx:229`; `supabase/migrations/20260919220000_reference_numbers.sql:47`
Description: The client calls `db.rpc("next_reference", { _vessel_id, _prefix, _table })` in 3 places. No migration creates a function named `next_reference`. The only related function is `public.next_reference_value(p_scope text)` — different name, different (single-argument) signature, built for `audits`/`drills`/`audit_findings` triggers. Every call site already has a silent fallback (`` `CO-${Date.now().toString().slice(-4)}` `` etc.), which is exactly why this has gone unnoticed — the RPC errors, but the UI never surfaces it.
Impact: Refit change orders, crew requests, and every `SimpleModule` entity configured with a `referencePrefix` never get a real DB-sequenced reference number — they get a non-unique, unscoped timestamp fragment instead, defeating the reference-numbering scheme for that module.
Suggested fix: Either create the missing `next_reference(_vessel_id uuid, _prefix text, _table text)` function, or repoint the 3 call sites at `next_reference_value` with a correctly built scope string.

The other 47 of 48 distinct RPC names called from `src/` all match a function created somewhere in `supabase/migrations/` (121 files scanned).

---

## 5. `.from()` table inventory vs schema

### TABLE — refit module ("rf_*", 30 relations) reference tables that exist nowhere in this repo's schema
Severity: Critical
Location: `src/modules/refit/**` (51 files use the module's `db` client, defined in `src/modules/refit/lib/db.ts`); relations: `rf_change_orders`, `rf_crew_requests`, `rf_purchase_orders`, `rf_invoices`, `rf_contractors`, `rf_logistics_items`, `rf_inventory_items`, `rf_meetings`, `rf_milestones`, `rf_risks`, `rf_departments`, `rf_cost_codes`, `rf_request_comments`, `rf_notifications`, `rf_drawings`, `rf_drawing_revisions`, `rf_documents`, `rf_certifications`, `rf_change_order_approvals`, `rf_budget_items`, `rf_schedule_items`, `rf_snags`, `rf_works_orders`, `rf_activity_feed`, `rf_audit_log`, `rf_auth_diagnostics`, `rf_vessels`, `rf_profiles`, plus `change_order_attachments` and `v_pending_approvals`.
Description: `src/modules/refit/lib/db.ts` casts the shared Supabase client to `any` ("Until the type file is regenerated against the live schema, we use loose casts") because, per its own comment, `types.ts` predates a set of tables it names *without* the `rf_` prefix (`change_orders`, `crew_requests`, etc.). Grepping all 121 migration files for **either** naming convention finds **zero** `CREATE TABLE`/`CREATE VIEW` for any of these 30 relations. This is different from the health-module finding below: these tables don't exist under any name, anywhere in this repo's SQL. The `as any` cast means every call compiles with no TypeScript error while being guaranteed to fail at runtime.
Impact: The entire refit ("shipyard/refit management") module is non-functional against this codebase's database — Dashboard, change-orders, crew-requests, approvals, purchase-orders, invoices, contractors, logistics, inventory, meetings, risks, budget, schedule, snags, works, drawings, document-control, audit-log, notifications all hit "relation does not exist" (42P01) on their core data loads.
Suggested fix: Locate/restore the refit schema migrations (may exist only in another branch/environment) and commit them, or clearly flag the module as unbacked/not-yet-shipped. Remove the `as any` cast once real tables exist so `tsc` can catch future drift.

### TABLE — health module (hw_/med_/nut_/physio_/pt_/spa_, 53 relations) missing from generated types, not from the database
Severity: High
Location: `src/modules/auth/contexts/AuthContext.tsx:180` (`hw_practitioners` — the exact case the prior typecheck flagged); 15 files under `src/modules/health/hooks/` (`useConsultations.ts`, `useFitnessAssessments.ts`, `useHealthPeople.ts`, `useHealthSettings.ts`, `useMedicalEquipment.ts`, `useMedicalProtocols.ts`, `useMedicalStores.ts`, `useNutrition.ts`, `usePatientRecord.ts`, `usePhysio.ts`, `usePractitioners.ts`, `usePtLibrary.ts`, `usePtPrograms.ts`, `useReferrals.ts`, `useScreening.ts`, `useSpa.ts`).
Description: All 53 relations (`hw_practitioners`, `hw_practitioner_qualifications`, `hw_people`, `hw_settings`, `hw_measurements`, `hw_referrals`, `hw_expiry_items`, `hw_fitness_status`, 20 `med_*` tables, 5 `nut_*` tables, 4 `physio_*` tables, 11 `pt_*` tables, 5 `spa_*` tables) **are** created by migrations (`supabase/migrations/20260919100000_health_phase1_foundation.sql` through `20260919140000_health_phase5_views_alerts_seeds.sql`, committed 2026‑09‑20). But `src/integrations/supabase/types.ts` — last touched 2026‑09‑21, i.e. *after* those migrations — still has no `Tables`/`Views` entries for any of them. Unlike refit's `db.ts`, these files import the plain, fully‑typed `supabase` client and `Tables`/`TablesInsert` helpers directly, with no `as any` escape — so every one of these calls is a genuine TypeScript compile error under the project's real `Database` type.
Impact: Unlike refit, these calls will very likely *succeed at runtime* (the tables are real), but the project fails `tsc --noEmit` — which this repo's own `MIGRATION-PLAN.md` Stage-6 checklist requires to be green — blocking clean builds/CI, and defeating type safety for the whole health module plus the auth context's practitioner-role check.
Suggested fix: Regenerate `types.ts` from the actual linked project (`supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts`). That it postdates the migrations by a day but still lacks them suggests the project used for codegen either doesn't have these migrations applied or `types.ts` was hand-edited rather than generated — that pipeline gap should be fixed first.

### TABLE — feedback_submissions: same types gap, already worked around
Severity: Low
Location: `src/modules/feedback/store/feedbackStore.ts:6`
Description: Created in `supabase/migrations/20260228120000_create_feedback_submissions.sql`, also absent from `types.ts`, but this call site already does `supabase.from('feedback_submissions' as any)` — a deliberate, self-aware cast.
Impact: None beyond the general types-regeneration gap above.
Suggested fix: Same fix as above; the `as any` can then be dropped.

### TABLE — `avatars` false positive (Storage bucket, not a DB table)
Severity: Cosmetic / informational
Location: `src/modules/hris/hooks/useHrProfile.ts:155,159`
Description: `.from('avatars')` here is `supabase.storage.from('avatars')` — Storage API, not a database table — caught by the initial broad grep and excluded after inspection. Side note: `MIGRATION-PLAN.md`'s list of storage buckets "in migrations" (`incident-attachments`, `trip-suggestion-attachments`, `development-documents`) doesn't include `avatars` either; if that bucket only exists via a dashboard action rather than a migration, it's a similar drift risk but for Storage, not for this phase's table check.
Impact: None for this check.
Suggested fix: None here; worth a look in a Storage-focused audit pass.

---

## Key files referenced
- `/home/user/maritime-master/supabase/config.toml`
- `/home/user/maritime-master/supabase/functions/{admin-actions,ai-route-planner,ais-refresh,external-api,extract-flight-data,extract-form-fields,hr-daily-sweeper,idea-sync,inbound-webhook,pt-exercise-import,send-email,sign-submission,submit-form}/index.ts`
- `/home/user/maritime-master/supabase/migrations/20260201210906_ae961fd0-2473-4dd9-b7a2-16c45a5ba983.sql` (webhook_configurations)
- `/home/user/maritime-master/supabase/migrations/20260919220000_reference_numbers.sql` (next_reference_value)
- `/home/user/maritime-master/supabase/migrations/20260919100000_health_phase1_foundation.sql` … `20260919140000_health_phase5_views_alerts_seeds.sql` (health module tables/views)
- `/home/user/maritime-master/src/modules/refit/lib/db.ts` (the `as any` cast root cause)
- `/home/user/maritime-master/src/modules/refit/pages/{change-orders,crew-requests,approvals,Dashboard}.tsx`
- `/home/user/maritime-master/src/modules/auth/contexts/AuthContext.tsx`
- `/home/user/maritime-master/src/modules/health/hooks/*.ts`
- `/home/user/maritime-master/src/modules/feedback/store/feedbackStore.ts`
- `/home/user/maritime-master/src/integrations/supabase/types.ts`

