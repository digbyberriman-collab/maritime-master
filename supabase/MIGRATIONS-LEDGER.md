# Migrations ledger

Which hand-written migrations in `supabase/migrations/` are live, which are not, and how to apply the rest (DECISIONS D-01, D-12; gap/00 E1, E2, W1).

**Why this file exists.** Lovable applies only the SQL it runs itself. When a repo migration is pasted into Lovable, Lovable commits its own copy under a UUID name (`<version>_<uuid>.sql`) and leaves the hand-written file where it is. Nothing else in the repo records which hand-written files reached the database. This ledger is that record: check it before assuming a table, policy or function exists.

**Rules.**

- Every hand-written (non-UUID-named) file has exactly one row in the ledger table. `src/test/config/migrations.test.ts` fails when a file has no row, when a row names a missing file, or when a status is not one of the three below.
- A new file goes in as `written, not applied` in the same commit that adds it. The build never assumes a repo migration is live (D-01): client code for its tables uses the pending shim (`src/integrations/supabase/pending.ts`) and degrades gracefully while the table is missing.
- Lovable's UUID-named copies are never renamed or deleted: deleting one desynchronises Lovable's history. They are recorded in the *Lovable copy* column of the file they copy, and need no row of their own (Lovable wrote them, so they ran).
- Rows name roles, never people (D-08).
- There is one database today, the live one. No staging project exists yet (gap/00 open question 2), so "applied" means applied live.

## Status vocabulary

| Status | Meaning | Evidence that counts |
|---|---|---|
| `applied` | The file's changes are in the live database. | A Lovable UUID copy whose statements match the file, **or** objects created only by this file (tables, views, non-trigger functions, columns) present in the generated `src/integrations/supabase/types.ts`, which Lovable regenerates from the live database. |
| `written, not applied` | The file is in the repo and its changes are not live. | Objects created only by this file are absent from `types.ts`, and no copy exists. |
| `unknown` | The repo cannot tell. | The file changes only things `types.ts` cannot show (policies, triggers, grants, function bodies with unchanged signatures) and no copy exists. Run the file's check query (below) against the live database to settle it, then update the row. |

How the evidence was gathered (22 Nov 2026): for each file, the objects it creates were matched against `types.ts`, and its statements (normalised, comments stripped) were matched against every UUID-named file. A copy counts when at least 70 % of the file's statements, and at least 70 % of the statements it adds (those found in no earlier migration), appear in it; the second test keeps a fix from being mistaken for a copy of the code it fixes. Trigger functions never appear in generated types, so a missing trigger function is not evidence either way.

## Ledger

In version order. *Lovable copy* is the UUID-named file that carries the same statements.

| # | File | Status | Evidence | Lovable copy | Notes |
|---|---|---|---|---|---|
| 1 | `20260228120000_create_feedback_submissions.sql` | written, not applied | `feedback_submissions` is not in `types.ts`; no copy. | — | Feeds the Quick feedback inbox, which R3 retires into Support. X6 decides whether to apply it or replace it with support tables. **Not idempotent** (its four `CREATE POLICY` statements have no `DROP POLICY IF EXISTS`): apply once only. |
| 2 | `20260501100000_work_rest_module.sql` | applied | All 10 `work_rest_*` / `vessel_work_rest_settings` tables and `profiles.hod_user_id` are in `types.ts`. | — | Applied by hand through the SQL editor (no Lovable copy). |
| 3 | `20260501210000_leave_management_upgrade.sql` | applied | `crew_leave_policies`, `crew_leave_balance_adjustments` and both added columns are in `types.ts`. | — | |
| 4 | `20260917100000_hris_phase0_substrate.sql` | applied | Copy matches 100 %. | `20260917174601_92aaeda7-6073-4ab7-b944-f088261368e1.sql` | |
| 5 | `20260917110000_hris_phase1_employee_records.sql` | applied | Copy matches 100 %. | `20260917175040_22d84f6b-e16c-4a59-91ed-526077d904ad.sql` | |
| 6 | `20260917110500_hris_avatars_bucket.sql` | applied | Copy matches 75 %, 11 of its 14 new statements (Lovable merged it with row 7). | `20260917175431_780bf2a9-cf3e-40be-a9b2-f37c8fff5950.sql` | One copy for rows 6 and 7. |
| 7 | `20260917113000_hris_phase1_followups.sql` | applied | Copy matches 95 %, 30 of its 33 new statements. | `20260917175431_780bf2a9-cf3e-40be-a9b2-f37c8fff5950.sql` | |
| 8 | `20260917120000_hris_phase2_compensation.sql` | applied | Copy matches 100 %. | `20260917180124_23c49cdb-e825-41e3-af00-55fb21bcceb4.sql` | |
| 9 | `20260917130000_hris_phase3_performance.sql` | applied | Copy matches 100 %. | `20260917180528_f62cd68d-2edf-4c01-b7d4-96d808b37c92.sql` | |
| 10 | `20260917140000_hris_phase4_recruitment_onboarding_rtw.sql` | applied | Copy matches 100 %. | `20260917180937_8438276a-d002-4d2a-9ffa-1895a70af12b.sql` | The copied `hr_generate_alerts` still has the uuid = text bug that rows 12 and 22 fix. |
| 11 | `20260917150000_hris_phase5_retention.sql` | applied | Copy matches 97 %, 101 of its 105 new statements. | `20260917181151_83a5b472-ef4b-4d26-9f66-4412934a9d32.sql` | |
| 12 | `20260917190000_hris_review_fixes.sql` | unknown | Replaces function bodies with unchanged signatures and adds a trigger; no copy holds its new statements. | — | HR authorisation hardening (privileged profile columns, tenant-scoped hire and onboarding, admin-only sweepers). Check query A. Idempotent. |
| 13 | `20260917200000_logbook_meridian_enums.sql` | applied | Copy matches 100 %. | `20260918224017_2a6ae0fa-ddaf-4f3b-ab23-f7dfa297f33e.sql` | |
| 14 | `20260917200100_logbook_meridian_books.sql` | applied | Its 5 tables, 8 non-trigger functions and `logbook_entries.volume_id` are in `types.ts`. | — | Applied without a Lovable copy. **Not idempotent** (plain `CREATE TABLE`, policies without `DROP POLICY IF EXISTS`): never re-run. |
| 15 | `20260919100000_health_phase1_foundation.sql` | applied | Copy matches 100 %. | `20260922094012_33f4cfaa-e001-44be-95bd-67065725b6a4.sql` | |
| 16 | `20260919110000_health_phase2_medical.sql` | applied | Copy matches 100 %. | `20260922094631_769c4458-ae26-4f7b-aa23-9ef1c8b95687.sql` | |
| 17 | `20260919120000_health_phase3_wellness.sql` | applied | Copy matches 100 %. | `20260922095031_8f56c9ab-4fc5-4f9e-8844-b6026e55eaf7.sql` | Shares version `20260919120000` with row 18 (the accepted legacy duplicate; see below). |
| 18 | `20260919120000_legal_module.sql` | applied | Its 6 `legal_*` tables and 13 non-trigger functions are in `types.ts`. | — | Shares version `20260919120000` with row 17. |
| 19 | `20260919130000_health_phase4_training.sql` | applied | Copy matches 100 %. | `20260922095402_923c70ee-8179-4d6f-8666-921820be336a.sql` | |
| 20 | `20260919140000_health_phase5_views_alerts_seeds.sql` | applied | Copy matches 100 %. | `20260924062303_46b3fd03-7ced-4596-9666-40394bf20883.sql` | |
| 21 | `20260919150000_fix_hr_generate_alerts_uuid.sql` | unknown | Replaces `hr_generate_alerts` with the same signature. 71 % of its statements are in row 10's copy, but none of the lines it changes: that copy holds the code it fixes. | — | Without it (or row 12) no HR alert is ever raised. Check query B. Idempotent. |
| 22 | `20260919170000_nb_company_scope.sql` | unknown | Policies and a trigger only; no copy. | — | **Security (P0):** replaces the New Build `USING (true)` policies with company-scoped ones. Check query C. Idempotent. |
| 23 | `20260919170100_signup_backstop.sql` | unknown | Policies only; no copy. | — | **Security (P0):** stops a signed-in user creating a company or a profile in someone else's company. Check query D. Idempotent. |
| 24 | `20260919200000_nb_search_and_buckets.sql` | applied | `nb_project_in_company`, `search_regulations` and `search_yard_standards` (created only here) are in `types.ts`. | — | |
| 25 | `20260919210000_ism_form_workflow.sql` | applied | `form_submission_counters`, 7 `form_*` functions and both `signing_cycle` columns are in `types.ts`. | — | **Not idempotent:** it drops the old update policy by its old name and creates `"Users can update their own submissions"` without dropping that name first, so a second run fails. Never re-run. |
| 26 | `20260919220000_reference_numbers.sql` | applied | Copy matches 100 %. | `20260925192821_a80c3990-da9f-454b-a717-648e00af254d.sql` | |
| 27 | `20260927120000_wire_crew_flags_into_frp_access.sql` | unknown | Replaces `frp_can_edit` / `frp_can_view` with the same signatures; no copy. | — | Makes the `crew.*` flags in Users & Access take effect in the leave and rotation planner. Check query E. Idempotent. |
| 28 | `20261123000100_platform_vessel_tenancy.sql` | written, not applied | `vessels.code` and the other seven P1 columns are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green. (`p1_vessel_tenancy`). | — | P1 (D-03, D-25; spec §A.1): vessel codes backfilled with the client derivation, set-code and Sold ⇔ archived triggers. Idempotent. Check query G. After the apply, review organisational pseudo-vessels (`is_counted`, `lifecycle_status`) and the codes users see (spec §G 2). |
| 29 | `20261123000200_platform_user_preferences.sql` | written, not applied | `user_preferences.density` and `show_roadmap` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green. (`p2_user_preferences`). | — | D-19, D-29, D-69: density and roadmap preference columns; theme default `dark`. Existing rows untouched. Idempotent. Check query H. |
| 30 | `20261123000300_platform_account_memberships.sql` | written, not applied | `account_memberships`, `account_membership_vessels`, `user_is_active` and the reach functions are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green. (`p2_memberships`, `p2_reach`: 22/22 users). | — | P2 (spec §A.3): memberships, the disabled-user status, internal and caller-checked reach helpers, profile sync, legacy-managed backfill. **Needs rows 12 and 23 live first** (its guard refuses otherwise: check queries A and D). Idempotent. Check query I. |
| 31 | `20261123000400_platform_capabilities.sql` | written, not applied | `has_capability` and `is_company_actor` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green. (`p2_capabilities`). | — | Server capability check (spec §A.4): seven keys, `user_roles` rows count only for the user's own company (CC-5), admin read policies on memberships. Idempotent. Check query J. |
| 32 | `20261123000500_platform_module_settings.sql` | written, not applied | `vessel_module_settings`, `company_module_settings` and `module_enabled` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green. (`p2_module_settings`). | — | P2 (spec §A.5; D-63, D-86, C13): per-vessel / per-company module flags, reach reads, fleet-admin writes, `module_enabled()` mirrors the client resolver. Idempotent. Check query K. |
| 33 | `20261123000600_platform_format_reference.sql` | written, not applied | `format_reference` and the formatters are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green. (`p2_reference`). | — | P2 (spec §A.6; C21, D-126): references on the live `reference_counters`; allocation is service role only. Idempotent. Check query L. |
| 34 | `20261123010000_platform_user_status.sql` | written, not applied | Redefines live helpers (unchanged signatures) and two policies, adds `set_membership_status` / `auth_user_id_for_email` (not in `types.ts`); no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p3_user_status`: the disabled-user matrix, the policy inventory). | — | P3 (spec §A.7; D-122): `user_belongs_to_company`, `get_user_company_id`, `my_profile_id`, `current_user_company_id`, `has_role`, `has_any_role`, `legacy_profile_role` and the own-row profile policies deny a disabled user; no self change of role / status / company / login; W7 guards on `set_membership_status`. **Changes every policy in the app:** apply in a quiet window, then run the two-company sign-in check and sign in as a disabled test user. Needs rows 12 and 23 live (its guard refuses otherwise). Idempotent. Check query M. |
| 35 | `20261123010100_platform_access_rls.sql` | written, not applied | `user_permission_overrides.company_id` / `vessel_id` and `permission_audit_log.company_id` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p3_access_rls`: vessel reads per persona, no self-escalation, one `log_permission_change`). | — | P3 (spec §A.8; D-25, D-124): vessel reads by reach (writes admin-only), role definitions frozen to the service role, `rbac_user_roles` / overrides / `user_roles` company-scoped with rank caps, audited by trigger; the audit log has no browser insert path. **Needs P1 (row 28) first:** its guard refuses otherwise (D-25). Idempotent. Check query N. |
| 36 | `20261123010200_platform_user_invitations.sql` | written, not applied | `user_invitations` and `revoke_invitation` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p3_invitations`). | — | P3 (spec §A.9; D-121): honest invitation status (sent only after a send that worked), legacy invited profiles backfilled as pending / `legacy_unverified`. Idempotent. Check query O. |
| 37 | `20261123020000_platform_record_registry.sql` | written, not applied | `record_kinds`, `record_envelopes`, `record_events`, `record_snapshots` and `record_transition` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p4_registry`: `record_transition_decide` = `transitionEnvelope` on 100 % of `record-transitions.json`, the D-51 lock on 100 % of `record-vessel-lock.json`). | — | P4 record engine, unit 1 of 3 (spec §A.10; D-132): **apply rows 37, 38 and 39 together, in order, in one sitting** (CC-18). Status changes only through the engine (a trigger refuses any other status write, for every role). Idempotent. Check query P. |
| 38 | `20261123020100_platform_record_signatures.sql` | written, not applied | `record_signature_slots`, `record_signatures`, the `record_signature_slot_states` view and `record_sign_slot` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p4_signatures`: every scenario of `record-signature-scenarios.json`). | — | P4 record engine, unit 2 of 3 (spec §A.11; D-48, D-51): ordered slots, sign / pass / remove / re-sign, on-behalf refused. With rows 37 and 39 in one sitting. Idempotent. Check query Q. |
| 39 | `20261123020200_platform_record_threads.sql` | written, not applied | `record_threads`, `record_thread_entries` and `record_post_thread_entry` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p4_threads`: every scenario of `record-thread-scenarios.json`, the engine integration tests). | — | P4 record engine, unit 3 of 3 (spec §A.12): status-update threads, whose move and follow-up dates. With rows 37 and 38 in one sitting. Idempotent. Check query R. |
| 40 | `20261123020300_platform_record_files.sql` | written, not applied | `file_objects`, `record_attachments`, `record_links`, `storage_path_allowed` and `register_file_object` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p4_files`: the bucket equals `upload-policy.json`, every path case, cross-tenant upload and read refused, the stored object required, attach to a closed record refused). | — | P4 files and links (spec §A.13; C7, C8): the private `records` bucket (50 MB, MIME allow-list) and its `records_select` / `records_insert` storage policies, file registration, attachments, generic links. Needs rows 37–39 (its guard refuses otherwise). Idempotent. Check query S. |
| 41 | `20261123020400_platform_export_jobs.sql` | written, not applied | `export_jobs`, `request_export` and `export_job_transition` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p4_exports`: every legal and illegal pair of the machine, a client can never set ready). | — | P4 exports (spec §A.14; C10): server jobs queued and moved only by the service-role machine, browser exports logged before the download. `export_downloads` comes with the export builder (C10, deferred). Needs rows 37–39. Idempotent. Check query T. |
| 42 | `20261123030000_platform_notification_outbox.sql` | written, not applied | `notification_outbox`, `notification_inbox`, `emit_notification_event` and `notification_inbox_mark_all_read` are not in `types.ts`; no copy. Verified on the DB harness (23 Nov 2026): legacy replay, build-out pass 1 and pass 2, and its SQL tests green (`p5_notifications`: recipients through the internal reach functions, no cross-tenant / disabled / no-reach / actor delivery, the fan-out failure path, an emit failure keeps the engine transition; `zz_platform`: the ACL inventory of all 15 files). | — | P5 (spec §A.15; D-62, proposed D-127, D-128): outbox and per-user inbox (own rows; only `read_at` / `archived_at` writable), inline fan-out with a retry processor, the `record_events` emit trigger, the engine notification types seeded into `notification_types`, the inbox added to `supabase_realtime`. **Apply last** (needs rows 37–41). Idempotent. Check query U. |

## Apply queue

What the product owner should do, in this order (version order). Run the check query first: if it shows the change is already live, mark the row `applied` and skip the file.

Dependencies of the Phase 2 files (orders 6–20; each file also asserts its prerequisites in a leading `DO` block and refuses to run without them, D-138):

- legacy rows 12 (`hris_review_fixes`) and 23 (`signup_backstop`), orders 1 and 4, are live (check queries A and D) **before order 8** (file 3); files 3 and 7 refuse to run otherwise;
- P1 (order 6, file 1) before order 13 (file 8): vessel RLS tightens only once every vessel has its code (D-25), enforced by file 8's guard;
- orders 8 and 9 (files 3–4, the reach and capability helpers) before every file whose policies call them (orders 10–20);
- order 11 (file 6, references) before order 15 (file 10, which allocates record references);
- orders 15–17 (files 10–12) are **one unit**: apply them together, in order, in one sitting (CC-18);
- orders 18 and 19 (files 13–14) after the unit; order 20 (file 15) **last** (it adds the `record_events` emit trigger and reads `export_jobs`);
- order 12 (file 7) changes `user_belongs_to_company`, `has_role`, `has_any_role` and the own-row profile policies for the whole app: apply it in a quiet window, then run the two-company sign-in check and sign in as a disabled test user.

| Order | File | Check first | If not live |
|---|---|---|---|
| 1 | `20260917190000_hris_review_fixes.sql` | Query A | Apply. Then run query B: this file also fixes `hr_generate_alerts`. |
| 2 | `20260919150000_fix_hr_generate_alerts_uuid.sql` | Query B | Apply (harmless if row 12 already fixed it). |
| 3 | `20260919170000_nb_company_scope.sql` | Query C | Apply. Security fix. |
| 4 | `20260919170100_signup_backstop.sql` | Query D | Apply. Security fix; also switch off public sign-up in Supabase Auth. |
| 5 | `20260927120000_wire_crew_flags_into_frp_access.sql` | Query E | Apply. |
| 6 | `20261123000100_platform_vessel_tenancy.sql` | Query G | Apply (Phase 2 file 1, P1). Then review the backfilled codes and pseudo-vessels (spec §G 2). |
| 7 | `20261123000200_platform_user_preferences.sql` | Query H | Apply (Phase 2 file 2). |
| 8 | `20261123000300_platform_account_memberships.sql` | Query I | Apply only after orders 1 and 4 (rows 12 and 23) are live: the file refuses to run otherwise (Phase 2 file 3). |
| 9 | `20261123000400_platform_capabilities.sql` | Query J | Apply (Phase 2 file 4). |
| 10 | `20261123000500_platform_module_settings.sql` | Query K | Apply (Phase 2 file 5). |
| 11 | `20261123000600_platform_format_reference.sql` | Query L | Apply (Phase 2 file 6). |
| 12 | `20261123010000_platform_user_status.sql` | Query M | Apply in a quiet window, only after orders 1, 4 and 8 (Phase 2 file 7): it changes `user_belongs_to_company`, `has_role` and `has_any_role` for every policy. Then sign in as users of two companies (each sees only its own data) and as a disabled test user (the "access disabled" screen). |
| 13 | `20261123010100_platform_access_rls.sql` | Query N | Apply only after order 6 (P1, D-25); the file refuses otherwise (Phase 2 file 8). Vessel writes become admin-only and the Roles & Permissions matrix read-only. |
| 14 | `20261123010200_platform_user_invitations.sql` | Query O | Apply (Phase 2 file 9). |
| 15 | `20261123020000_platform_record_registry.sql` | Query P | Apply orders 15, 16 and 17 together, in this order, in one sitting (Phase 2 files 10–12, the record engine unit). |
| 16 | `20261123020100_platform_record_signatures.sql` | Query Q | Apply right after order 15. |
| 17 | `20261123020200_platform_record_threads.sql` | Query R | Apply right after order 16. |
| 18 | `20261123020300_platform_record_files.sql` | Query S | Apply after orders 15–17 (Phase 2 file 13): the private `records` bucket and its storage policies, file registration, attachments and links. |
| 19 | `20261123020400_platform_export_jobs.sql` | Query T | Apply after order 18 (Phase 2 file 14). |
| 20 | `20261123030000_platform_notification_outbox.sql` | Query U | Apply last (Phase 2 file 15): the outbox, the inbox (with realtime) and the record-engine emit trigger. Then sign in, open the bell and confirm the inbox loads (empty is fine). |
| — | `20260228120000_create_feedback_submissions.sql` | Query F | Hold until X6 decides (R3). Apply once only if Quick feedback must work before Support exists. |

Check queries (read-only; run in the Supabase SQL editor):

```sql
-- A. hris_review_fixes: 1 row means applied.
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_profiles_guard_privileged_columns';

-- B. hr_generate_alerts fixed (by row 12 or row 21): true means applied.
SELECT position('record_id::text' IN pg_get_functiondef('public.hr_generate_alerts(uuid)'::regprocedure)) = 0 AS fixed;

-- C. nb_company_scope: no rows means applied (the permissive policies are gone).
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname = 'public' AND tablename LIKE 'nb\_%' AND policyname LIKE '%\_auth\_all';

-- D. signup_backstop: 0 means applied.
SELECT count(*) FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Service role can create companies';

-- E. wire_crew_flags_into_frp_access: true means applied.
SELECT position('crew.edit_crew_profiles' IN pg_get_functiondef('public.frp_can_edit(uuid)'::regprocedure)) > 0 AS applied;

-- F. create_feedback_submissions: true means applied.
SELECT to_regclass('public.feedback_submissions') IS NOT NULL AS applied;

-- G. platform_vessel_tenancy (Phase 2 file 1): true means applied.
SELECT count(*) = 8 AS applied FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'vessels'
   AND column_name IN ('code', 'short_code', 'lifecycle_status', 'is_counted', 'vessel_purpose', 'archived_at', 'archived_by', 'archive_reason');

-- H. platform_user_preferences (Phase 2 file 2): true means applied.
SELECT count(*) = 2 AS applied FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name IN ('density', 'show_roadmap');

-- I. platform_account_memberships (Phase 2 file 3): true means applied.
SELECT to_regclass('public.account_memberships') IS NOT NULL
   AND to_regprocedure('public.user_can_reach_vessel(uuid,uuid)') IS NOT NULL AS applied;

-- J. platform_capabilities (Phase 2 file 4): true means applied.
SELECT to_regprocedure('public.has_capability(text,uuid,uuid)') IS NOT NULL AS applied;

-- K. platform_module_settings (Phase 2 file 5): true means applied.
SELECT to_regclass('public.vessel_module_settings') IS NOT NULL
   AND to_regprocedure('public.module_enabled(uuid,text,date)') IS NOT NULL AS applied;

-- L. platform_format_reference (Phase 2 file 6): true means applied.
SELECT to_regprocedure('public.format_reference(text,uuid,uuid,date)') IS NOT NULL AS applied;

-- M. platform_user_status (Phase 2 file 7): true means applied.
SELECT to_regprocedure('public.set_membership_status(uuid,text,uuid,text)') IS NOT NULL
   AND position('user_is_active' IN pg_get_functiondef('public.user_belongs_to_company(uuid,uuid)'::regprocedure)) > 0 AS applied;

-- N. platform_access_rls (Phase 2 file 8): true means applied.
SELECT count(*) = 2 AS applied FROM pg_policies
 WHERE schemaname = 'public' AND ((tablename = 'vessels' AND policyname = 'vessels_select') OR (tablename = 'user_roles' AND policyname = 'user_roles_select_admin'));

-- O. platform_user_invitations (Phase 2 file 9): true means applied.
SELECT to_regclass('public.user_invitations') IS NOT NULL
   AND to_regprocedure('public.record_invitation_send(uuid,text,text,text,uuid,text,timestamptz,uuid)') IS NOT NULL AS applied;

-- P. platform_record_registry (Phase 2 file 10): true means applied.
SELECT to_regclass('public.record_envelopes') IS NOT NULL
   AND to_regprocedure('public.record_transition(uuid,text,jsonb,integer)') IS NOT NULL AS applied;

-- Q. platform_record_signatures (Phase 2 file 11): true means applied.
SELECT to_regclass('public.record_signatures') IS NOT NULL
   AND to_regclass('public.record_signature_slot_states') IS NOT NULL AS applied;

-- R. platform_record_threads (Phase 2 file 12): true means applied.
SELECT to_regclass('public.record_thread_entries') IS NOT NULL
   AND to_regprocedure('public.record_post_thread_entry(uuid,uuid,text,text,text,date,date,uuid,uuid)') IS NOT NULL AS applied;

-- S. platform_record_files (Phase 2 file 13): true means applied.
SELECT to_regclass('public.file_objects') IS NOT NULL
   AND to_regprocedure('public.register_file_object(text,text,text,text,bigint,text)') IS NOT NULL
   AND EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'records') AS applied;

-- T. platform_export_jobs (Phase 2 file 14): true means applied.
SELECT to_regclass('public.export_jobs') IS NOT NULL
   AND to_regprocedure('public.export_job_transition(uuid,text,jsonb)') IS NOT NULL AS applied;

-- U. platform_notification_outbox (Phase 2 file 15): true means applied.
SELECT to_regclass('public.notification_inbox') IS NOT NULL
   AND to_regprocedure('public.notification_inbox_mark_all_read(timestamptz)') IS NOT NULL
   AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_record_events_emit') AS applied;
```

## How to apply a migration

Lovable stays the publish and database-apply path (D-01). Either route works; the SQL editor leaves no copy behind, Lovable does.

1. **Check.** Read the file's row and run its check query. Apply only what is not live, one file at a time, in version order.
2. **Apply.**
   - *Supabase SQL editor:* open the project's SQL editor, paste the whole file, run it. Files written from 23 Nov 2026 are idempotent, so a second run is harmless. A legacy file marked "not idempotent" must run once only.
   - *Lovable:* ask it to run the file exactly as written ("apply `supabase/migrations/<file>` as is, without changes"). Lovable commits a UUID-named copy into `supabase/migrations/`; keep it.
3. **Verify.** Run the check query again (or, for a new table, `SELECT to_regclass('public.<table>')`). For a file with RLS, sign in as two users of different companies and confirm each sees only their own rows.
4. **Regenerate types.** Lovable's sync regenerates `src/integrations/supabase/types.ts` (or `supabase gen types typescript --project-id <project-id> > src/integrations/supabase/types.ts`) in a commit that changes nothing else. Never edit `types.ts` by hand.
5. **Remove the shim.** `src/test/config/pendingTables.test.ts` now fails for every table in a `types/db.pending.ts` that `types.ts` knows; delete those entries and switch the module to the generated types.
6. **Record.** Update the row in the same commit: status `applied`, the evidence ("applied <date> by <role> via SQL editor / Lovable"), and the Lovable copy's file name if one appeared.

## Known exceptions

- **Duplicate version `20260919120000`.** `20260919120000_health_phase3_wellness.sql` and `20260919120000_legal_module.sql` share one 14-digit version, which the Supabase CLI treats as a single migration. Both are applied. They stay as they are (renaming an applied file would desynchronise the histories); do not use `supabase db push` or `db reset` against this folder until the history is repaired. `migrations.test.ts` accepts this one duplicate and fails on any other.
- **Legacy non-idempotent files.** `20260228120000_create_feedback_submissions.sql` (not applied: apply once), and `20260917200100_logbook_meridian_books.sql` and `20260919210000_ism_form_workflow.sql` (applied: never re-run). Files before `20261123` are not held to the idempotency rule; they are history, and editing an applied file is never the fix (gap/00 W1).
- **Fresh replay needs the harness's governance.** As written, the full set does not replay on an empty database: two hand-written HRIS files (`20260917113000_hris_phase1_followups.sql`, `20260917150000_hris_phase5_retention.sql`) compare uuid to text and never ran live as written (their Lovable copies, rows 7 and 11, carry the corrected statements), and a few files need schema state no migration creates (`docs/HEALTH.md`; gap/00 E5). The local DB harness (`node scripts/db/harness.mjs`, `scripts/db/README.md`) replays the whole folder onto a fresh database under `supabase/tests/harness/replay.json` (those two files as expected failures with evidence, two drift patches for live schema state, row 1 skipped as not applied) and checks the result against `types.ts`. `supabase db reset` against this folder still fails.

## Build-out migrations (from `20261123`)

Every file dated `20261123000000` or later follows D-12 and gap/00 §3, and `src/test/config/migrations.test.ts` enforces it:

- name `<YYYYMMDDHHMMSS>_<module>_<topic>.sql` (lower case, underscores), with a version used by no other file;
- the hour inside the stream's block: platform `00`–`03`, fleet operations `04`, fleet administration `05`, crew `06`, safety `07`, certificates and technical `08`, voyage, charter, calendar and reports `09`, support `10`, Refit import `11`, fixes and seeds `12`–`13`;
- idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE MATERIALIZED VIEW IF NOT EXISTS`, `DROP POLICY IF EXISTS` for the same name and table before each `CREATE POLICY`, `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER`, `CREATE OR REPLACE` for functions and views, `ON CONFLICT` (or a `NOT EXISTS` guard) on every `INSERT`, and enum types and domains created inside a guarded `DO` block;
- idempotent `ALTER`s (each action of an `ALTER TABLE` list is checked on its own):
  - `ADD COLUMN IF NOT EXISTS` (or `ADD IF NOT EXISTS`) for every new column;
  - `DROP CONSTRAINT IF EXISTS <name>` on the same table before each `ADD CONSTRAINT <name>`, either as an earlier statement or earlier in the same list (`ALTER TABLE t DROP CONSTRAINT IF EXISTS c, ADD CONSTRAINT c UNIQUE (code)`). Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so every constraint is named: an unnamed `ADD PRIMARY KEY` / `UNIQUE` / `CHECK` / `FOREIGN KEY` / `EXCLUDE` cannot be guarded and fails;
  - `ALTER TYPE … ADD VALUE IF NOT EXISTS`; besides that, `ALTER TYPE` allows only `OWNER TO` and `DROP ATTRIBUTE IF EXISTS`, so `RENAME VALUE`, `RENAME ATTRIBUTE`, `RENAME TO`, `ADD ATTRIBUTE` (which has no `IF NOT EXISTS`) and `SET SCHEMA` fail;
  - the other `ALTER TABLE` actions are an allow-list: `ENABLE` / `DISABLE` / `FORCE` / `NO FORCE ROW LEVEL SECURITY`, `ALTER [COLUMN] …` (but not `ADD GENERATED … AS IDENTITY`, nor `DROP IDENTITY` / `DROP EXPRESSION` without `IF EXISTS`), `SET (…)` / `RESET (…)`, `SET LOGGED` / `UNLOGGED` / `TABLESPACE` / `WITHOUT CLUSTER`, `OWNER TO`, `REPLICA IDENTITY`, `ENABLE` / `DISABLE [REPLICA | ALWAYS] TRIGGER` / `RULE`, `VALIDATE CONSTRAINT` and `CLUSTER ON`. Any other action fails as unrecognised and goes in a guarded `DO` block: that includes `RENAME`, `ATTACH` / `DETACH PARTITION`, `INHERIT` / `NO INHERIT` and `SET SCHEMA`;
  - `ALTER … RENAME` and `ALTER … SET SCHEMA` fail on every other object too (a function, a policy, a view): a second run finds the object already moved;
  - `IF EXISTS` on a `DROP` of any object kind: `DROP COLUMN IF EXISTS`, `DROP CONSTRAINT IF EXISTS`, and `DROP TABLE` / `VIEW` / `INDEX [CONCURRENTLY]` / `FUNCTION` / `ROUTINE` / `RULE … ON` / `EVENT TRIGGER` / `FOREIGN TABLE` / `AGGREGATE` / `OPERATOR` / `CAST` / … `IF EXISTS`;
- known-safe statements only. A top-level statement that is none of the forms above and none of `DO`, `CREATE OR REPLACE FUNCTION` / `PROCEDURE` / `VIEW` / `TRIGGER` / `RULE`, `CREATE <kind> IF NOT EXISTS`, `GRANT`, `REVOKE`, `COMMENT ON`, `ALTER POLICY`, `ALTER FUNCTION` / `PROCEDURE` / `ROUTINE` attribute changes (`SET`, `RESET`, `OWNER TO`, `SECURITY …`, volatility), `ALTER VIEW` / `MATERIALIZED VIEW` / `INDEX` `SET` / `RESET` / `OWNER TO` / `ALTER COLUMN`, `ALTER SEQUENCE` `OWNED BY` / `RESTART` / `INCREMENT` / bounds / `CACHE`, `ALTER DEFAULT PRIVILEGES`, `UPDATE`, `DELETE`, `SELECT`, `WITH` (a `WITH … INSERT` needs the same guard as an `INSERT`), `REFRESH MATERIALIZED VIEW`, `NOTIFY`, `SET`, `RESET`, `BEGIN`, `COMMIT`, `START TRANSACTION` or `ANALYZE` fails as unrecognised: put it in a guarded `DO` block. That covers `CREATE RULE` without `OR REPLACE`, `CREATE ROLE` and `CREATE EVENT TRIGGER`. `ALTER PUBLICATION … ADD TABLE` / `DROP TABLE` errors on a second run, so it goes in a `DO` block with an `EXCEPTION` guard (`DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.x; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`; use `undefined_object` for `DROP TABLE`);
- `ENABLE ROW LEVEL SECURITY` on every table it creates, and no `USING (true)` / `WITH CHECK (true)` policy for anyone but `service_role`. The rule covers `ALTER POLICY` as well as `CREATE POLICY`, and the policy's role list must be exactly `TO service_role`: `TO service_role, authenticated` fails, and so does a policy with no `TO` list (that means PUBLIC; on `ALTER POLICY` it keeps roles the file does not show). The policy's name does not count, so `"open to service_role" … TO authenticated` fails too.

Add each new file to the ledger table above as `written, not applied`, in the commit that adds it.
