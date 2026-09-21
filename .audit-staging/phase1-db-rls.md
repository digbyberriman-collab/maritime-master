# Phase 1 Discovery — Database schema & RLS (agent a9810e0d6674dd077)

## Factual data summary
| Metric | Count |
|---|---|
| Tables in types.ts (public schema) | 261 (not 335+ as assumed in Section 0 — correction) |
| Migration files | 121 (not "hundreds" as assumed) |
| Migration date range | 2026-01-25 to 2026-09-19 (~8 months; 49 of 121 in Sept 2026 alone) |
| ENABLE ROW LEVEL SECURITY statements | 321 raw -> 281 unique tables |
| Tables with no RLS-enable found under current name | 3 (1 genuine gap, 2 false positives from renames) |
| CREATE POLICY statements | 843 total, attributed to 280 unique tables |
| Tables RLS-on with zero CREATE POLICY | 2 (both confirmed intentional, SECURITY DEFINER-only) |
| Unique SECURITY DEFINER functions | 145 (206 total definitions counting redefinitions) |
| SECURITY DEFINER functions with unpinned search_path | 0 — every one pins SET search_path = public |
| Explicit TO anon policies | 9, all USING (false) deny-all guards — correct |
| Tables reachable by anon via real RLS gap (no TO clause + USING(true)) | 2: equipment_categories, ports (low-sensitivity reference data) |
| Public storage buckets | 2: client-logos, avatars — both intentional |
| Edge functions with verify_jwt=false | 26 of 27 |
| Edge functions confirmed with NO internal auth check at all | 2: send-email (CRITICAL), geocode-search (low) |
| Hardcoded secrets found in migrations | 0 |

## Table inventory by domain (261 tables)
Crew/HR/Payroll/Recruitment ~61, New Build (nb_*) 43, ISM Safety/Audits/Incidents/Drills 21, ISM Forms/SMS 17, Admin/System/Audit-trail ~19, Travel/Logistics ~18, Work/Rest Hours (MLC) 10, RBAC/Permissions 10, Vessels/Fleet ~11, Logbooks 9, Maintenance/Equipment 7, Fleet Rotation Planner (frp_*) 7, Company/Org/Settings 6, Legal 6, Notifications/Alerts 5, Document Control 5, Insurance 3, Certificates 2, **Health & Wellness: 0 in live schema (see Critical finding — built in migrations, absent from types.ts)**.

## CRITICAL FINDINGS

### RLS — Cross-tenant PII exposure via crew_import
Severity: CRITICAL
Location: supabase/migrations/20260428170231_91a1ab54-4793-4679-9bd3-90fb59e1f364.sql (policy crew_import_read_authenticated), table public.crew_import
Description: crew_import is a flat Airtable-staging table holding full legal name, personal/work email, DOB, nationality, phone numbers, and next-of-kin name/phone for imported crew — but has NO company_id column. Its SELECT policy is `FOR SELECT TO authenticated USING (true)`, never tightened (a later migration 20260916133246 only added write policies gated by role). Every logged-in user of EVERY tenant company on the platform can SELECT * from this table and read every other company's imported crew PII.
Impact: Full cross-tenant PII leak (names, DOB, nationality, personal contact, next-of-kin) reachable by any authenticated user of the multi-tenant SaaS, not just their own company.
Suggested fix: Add company_id column (populate via linked vessels_import/matching logic), replace policy with `USING (company_id = get_user_company_id(auth.uid()))`. Same pattern applies to vessels_import (lower sensitivity, vessel names only) — scope or drop its TO authenticated USING(true) SELECT policy too.

### Migration hygiene — Health & Wellness module built but absent from live schema
Severity: CRITICAL
Location: supabase/migrations/20260919100000_health_phase1_foundation.sql through 20260919140000_health_phase5_views_alerts_seeds.sql (5 files, ~170KB) vs src/integrations/supabase/types.ts
Description: These 5 migrations create a complete 49-table Health & Wellness module (hw_*, med_*, nut_*, pt_*/physio_*, spa_*) with RLS, ~30 CREATE POLICY statements, 14 SECURITY DEFINER functions. NONE of these 49 tables appear in types.ts. Cross-checked: equally-recent New Build (nb_*, 43 tables), Legal (6 tables), ISM-form-workflow migrations from the SAME WEEK all match types.ts perfectly — this is isolated to Health & Wellness, not general staleness. A live frontend module (src/modules/health/, 14 hook files) actively queries hw_practitioners and friends.
Impact: Either (a) migrations were never applied to production — the shipped Health & Wellness frontend is broken for every user (every query 404s/"relation does not exist"), or (b) types.ts wasn't regenerated after this module landed, meaning this whole audit's "trust types.ts" premise under-counts 49 tables whose RLS/policy state was NOT actually verified.
Suggested fix: Confirm against actual production Postgres (\dt hw_*, \dt med_*, or supabase db diff) which case is true. If (a) decide whether to apply migrations or pull the frontend feature until ready. If (b) regenerate types.ts and re-run this inventory.
NOTE FOR ORCHESTRATOR: This directly bears on the ~2925 pre-existing TypeScript errors already found in src/modules/health/** during PR #31's CI run (property-does-not-exist-on-type errors against Health module tables). Those errors are consistent with EITHER explanation here. Needs live-DB verification to resolve definitively.

### Anonymous access — open, unauthenticated email-sending relay
Severity: CRITICAL
Location: supabase/functions/send-email/index.ts; supabase/config.toml ([functions.send-email] verify_jwt = false)
Description: verify_jwt=false AND no internal auth check of any kind (no bearer-token verification, no shared secret, no API key). Accepts {to, template, variables, idempotencyKey, cc, from} from any internet caller and sends via the company's Resend account. `to`/`cc` AND `from` (body.from || EMAIL_FROM || 'STORM <noreply@storm-maritime.com>') are attacker-controlled, as are all template variables (e.g. ALERT_ESCALATION/PASSWORD_RESET templates let an attacker set action_link/reset_link to a phishing URL while the email is legitimately signed by STORM's own trusted domain/Resend account).
Impact: Unauthenticated internet-wide phishing-as-a-service using the company's own sending reputation/domain, plus unbounded cost/abuse of the Resend account and blacklist/reputation risk to storm-maritime.com.
Suggested fix: Require service-role bearer token or internal shared secret header before sending; never let caller set `from`; rate-limit and restrict to/cc to addresses tied to a validated company/user in the DB.

## Other findings

### Anonymous access — open unauthenticated geocoding proxy
Severity: Low
Location: supabase/functions/geocode-search/index.ts
Description: verify_jwt=false, CORS *, no auth check — bare passthrough to OSM Nominatim.
Impact: Anyone can use STORM's infra as a free unauthenticated geocoding proxy (cost/abuse, potential Nominatim usage-policy violation), no STORM data exposed.
Suggested fix: Require valid session, add rate limiting.

### Anonymous access — RLS gap on two reference tables
Severity: Low
Location: equipment_categories, ports (ports_select policy)
Description: Both `FOR SELECT USING (true)` with no TO clause -> defaults to PUBLIC, so anon can read with just the public anon key. Sibling tables drill_types/training_courses had the same pattern, patched later (20260610104821) to add TO authenticated — these two were missed.
Impact: Low (non-tenant reference data, not PII) but a real anon-access surface and inconsistency with the schema's standard convention.
Suggested fix: ALTER POLICY (or drop/recreate) both to add TO authenticated.

### RLS — undocumented table with no migration history
Severity: Medium (unknown pending verification)
Location: dev_todos (in types.ts, zero CREATE TABLE/RLS/POLICY statements anywhere in migrations)
Description: Exists in live schema, referenced by a stray root-level supabase_domain_migration.sql script, never created through a tracked migration — created out-of-band (Studio or Lovable). RLS/policy state cannot be verified from source control.
Impact: Unknown — could be world-readable or locked down, no way to tell without querying live DB. Governance gap: schema changes happening outside the migration pipeline.
Suggested fix: SELECT relrowsecurity FROM pg_class WHERE relname='dev_todos' + list policies directly against production. Backfill a migration file. Treat further out-of-band schema edits as a process problem.

### Migration hygiene — untracked data-migration script at repo root
Severity: Medium
Location: /home/user/maritime-master/supabase_domain_migration.sql
Description: 11KB script at repo root runs UPDATEs directly against dev_todos, corrective_actions, maintenance_tasks rewriting hardcoded storage URLs (.supabase.co -> .supabase.com). Not in supabase/migrations/, no timestamp/ordering, no record of whether/when run.
Impact: Production-data-mutating script untracked by migration tooling — no audit trail, no rollback.
Suggested fix: Delete if already applied and no longer needed, or convert to a proper timestamped idempotent migration.

### Migration hygiene — duplicate migration timestamp
Severity: Low
Location: 20260919120000_health_phase3_wellness.sql and 20260919120000_legal_module.sql
Description: Two unrelated migrations share the exact same 14-digit timestamp prefix.
Impact: Fragile ordering guarantee; risk of tooling confusion or silent skip in stricter migration runners.
Suggested fix: Re-timestamp one file, update any docs/tooling referencing the old name.

### RLS — dead legacy tables retained (cosmetic, not a gap)
Location: roles_legacy_v1, role_permissions_legacy_v1 (renamed from roles/role_permissions during RBAC rewrite). RLS state carried through the rename correctly — the automated "no RLS under this name" flag was a methodology artifact, not a real gap.
Suggested fix: Confirm nothing reads them, then drop.

### Counters correctly locked to SECURITY DEFINER only (verified safe, not a finding)
form_submission_counters, reference_counters — RLS on, zero policies, explicit REVOKE ALL from anon/authenticated, documented in-line. Correct pattern, no action needed.

## Anonymous access — full accounting
- DB tables truly reachable by anon: equipment_categories, ports (read-only, non-sensitive).
- TO anon policies: 9, all USING(false) — controls, not gaps.
- Public storage buckets: client-logos, avatars — intentional.
- Edge functions bypassing JWT gate: 26/27. Manually checked ~15: send-email and geocode-search have no internal auth; admin-actions, create-crew-member, bulk-invite, external-api, airtable-sync, ais-refresh, idea-sync, hr-daily-sweeper, inbound-webhook, accept-invitation all implement their own bearer/shared-secret/system-key check. NOT deep-reviewed: complete-drill, extract-flight-data, extract-form-fields, generate-travel-letter, notify-shipping-master, review-certificate, send-invitation, send-to-agent, sign-submission, submit-form, update-crew-assignment, update-familiarization, parse-crew-csv, ai-route-planner — confirmed they reference an auth/secret check somewhere but not that it's correctly enforced. Follow-up needed.

## RPC/SECURITY DEFINER inventory (145 unique functions, all pin search_path)
Grouped: RBAC/access-control helpers (has_role, has_any_role, get_user_company_id, etc.), module view/edit/admin gates (hr_can_view/edit/admin, payroll_*, medical_*, wellness_*, legal_*, frp_*), logbook integrity guards (sign_entry, seal_page, close_volume, signoff/meridian guards), reference-number generators, HR/payroll lifecycle triggers (including sync_crew_import_to_profiles — the function that promotes crew_import rows into profiles, relevant to the PII finding above), legal module workflow, Health & Wellness module functions (built but not live), dashboards/misc.

No unpinned-search_path SECURITY DEFINER functions found anywhere — genuinely strong practice, consistently applied since the earliest migrations.

No files modified.
