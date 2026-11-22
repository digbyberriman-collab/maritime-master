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

## Apply queue

What the product owner should do, in this order (version order). Run the check query first: if it shows the change is already live, mark the row `applied` and skip the file.

| Order | File | Check first | If not live |
|---|---|---|---|
| 1 | `20260917190000_hris_review_fixes.sql` | Query A | Apply. Then run query B: this file also fixes `hr_generate_alerts`. |
| 2 | `20260919150000_fix_hr_generate_alerts_uuid.sql` | Query B | Apply (harmless if row 12 already fixed it). |
| 3 | `20260919170000_nb_company_scope.sql` | Query C | Apply. Security fix. |
| 4 | `20260919170100_signup_backstop.sql` | Query D | Apply. Security fix; also switch off public sign-up in Supabase Auth. |
| 5 | `20260927120000_wire_crew_flags_into_frp_access.sql` | Query E | Apply. |
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
- **Fresh replay fails.** The full set does not replay on an empty database (an HRIS follow-up policy compares uuid to text, `docs/HEALTH.md`). A forward-only fix is planned (gap/00 E5); until then no CI job can stand up a fresh database.

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
