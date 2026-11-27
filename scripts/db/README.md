# Local database harness

Replays every migration in `supabase/migrations/` onto a throwaway PostgreSQL cluster with a Supabase stub, checks the result against the generated `types.ts`, applies the build-out migrations twice, and runs the SQL tests in `supabase/tests/sql/`. It is how Phase 2 (P1–P5) and every later migration is verified before the owner applies anything live (Phase 2 spec §D; proposed D-120, D-131).

The live Supabase project is never contacted: there is no network, no project URL and no key anywhere in the harness. The cluster lives in `/tmp/storm-pg-<pid>/` and is removed at the end of the run.

## Run it

Always through the lock, one run at a time:

```bash
# Full run: stub -> legacy replay -> fidelity -> build-out x2 -> contract -> SQL tests
flock /tmp/storm-db.lock node scripts/db/harness.mjs

# Only the legacy replay and the fidelity check
flock /tmp/storm-db.lock node scripts/db/harness.mjs --replay-only

# Idempotency loop for one build-out file: every build-out file up to it once, then it again
flock /tmp/storm-db.lock node scripts/db/harness.mjs --file 20261123000100_platform_vessel_tenancy.sql --tests 'p1_*/**'

# Only some SQL test files (glob relative to supabase/tests/sql/)
flock /tmp/storm-db.lock node scripts/db/harness.mjs --tests '00_harness/**'

# Keep the cluster for debugging (prints the psql and stop commands)
flock /tmp/storm-db.lock node scripts/db/harness.mjs --keep

# CI without PostgreSQL: exit 0 with a SKIP line instead of 2
node scripts/db/harness.mjs --allow-skip

# Tests of the harness itself. All but harness-lifecycle.test.mjs and last-manager-race.test.mjs are
# unit tests (no cluster); those two start throwaway clusters, each through the lock itself, so never
# run this under the lock (they are skipped without PostgreSQL binaries or flock)
node --test scripts/db/test/*.test.mjs
```

Never start ad-hoc clusters on fixed ports: the harness picks a free port and a private socket directory for every run.

### Flags

| Flag | Meaning |
|---|---|
| (none) | full run: discover -> cluster -> stub -> legacy replay -> fidelity -> build-out pass 1 and pass 2 -> test library -> contract check -> SQL tests -> teardown |
| `--replay-only` | stop after the legacy replay and the fidelity check |
| `--file <migration>` | build-out files up to and including `<migration>` once, then `<migration>` again; the SQL tests still run unless `--no-tests` |
| `--tests <glob>` | only the SQL test files matching the glob, relative to `supabase/tests/sql/` (`**` any depth, `*` one segment, `{a,b}`; a bare directory name selects everything under it; a comma-separated list such as `'p4_files/**,p5_notifications/**'` selects the union) |
| `--no-tests`, `--no-fidelity`, `--no-contract` | skip that phase (never in CI) |
| `--keep` | keep the cluster; prints `psql -h <socket dir> -p <port> -U postgres storm`, the data directory and the stop command |
| `--report <path>` | JSON report path (default `$TMPDIR/storm-db-report.json`); a path inside the repo is refused |
| `--allow-skip` | exit 0 with `SKIP: no PostgreSQL binaries found` when no binaries are found |
| `--pg-bin <dir>` | binaries directory; when given and unusable there is no fallback (it counts as "no PostgreSQL") |
| `--verbose` | echo psql output and every assertion |
| `-h`, `--help` | usage |

`--replay-only` cannot be combined with `--file` or `--tests`, nor `--no-tests` with `--tests`; a repeated or unknown flag is a usage error.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | green (or `SKIP` with `--allow-skip`) |
| 1 | any failure: invalid `replay.json`, an unexpected replay failure, an `expect_failure` file that applied, a drift patch that failed, a fidelity miss without an exception, a build-out file that fails (pass 1) or fails on its second run (pass 2, not idempotent), an object defined in two build-out files (rule §0.2), a contract mismatch, a failing or aborted SQL test file, a test file with no assertion, or no test file matching `--tests` |
| 2 | no PostgreSQL binaries (without `--allow-skip`) |
| 3 | usage error (bad flag, `--report` inside the repo, `--file` that is not a build-out migration) |
| 129, 130, 143 | interrupted by `SIGHUP`, `SIGINT`, `SIGTERM` (torn down, with a report that says so) |

The report's `exitCode` is always the exit code the process exits with.

### Output

TAP-like lines on stdout (`ok N - …`, `not ok N - …` with `  # ` diagnostics, `1..N` at the end), a `# PASS` / `# FAIL` summary and the report path.

The report records every run. As soon as the report path is known (after the flags parse), a provisional report replaces whatever the path held (`"exitCode": null`, `"problems": ["run did not finish"]`), so an earlier run's green report never survives a later run; when it cannot be written, the old file is removed. Every exit then writes the final one with the exit code: a pass or a failure, a usage error found after the path is known (`--file` that is not a build-out migration, exit 3), no PostgreSQL (exit 2), a signal (`"problems"` ends with `interrupted by SIGTERM` and so on; exit 129 / 130 / 143), an error in the harness itself, including `initdb` or `pg_ctl` failing (`not ok - harness error`, the `# FAIL` summary, `harness error: …`, exit 1). Only a run killed outright (`SIGKILL`) keeps the provisional report, which still says it did not finish. The JSON report:

```json
{
  "tool": "scripts/db/harness.mjs", "startedAt": "…", "durationMs": 5000, "exitCode": 0,
  "options": {}, "postgres": { "binDir": "…", "version": "…" }, "cluster": { "root": "/tmp/storm-pg-123", "port": 41234 },
  "phases": { "stub": {}, "replay": {}, "fidelity": {}, "buildOut": {}, "testlib": {}, "contract": {}, "tests": {} },
  "replay": [{ "file": "…", "action": "apply", "ok": true, "outcome": "applied", "drift": [], "error": "…" }],
  "fidelity": { "ok": true, "counts": {}, "unexplained": [], "explained": [], "warnings": [] },
  "buildOut": { "ok": true, "files": [], "pass1": [], "pass2": [], "redefinitions": [] },
  "contract": { "ok": true, "status": "checked", "problems": [], "known": [{ "key": "…", "message": "…", "followup": "…" }], "warnings": [], "counts": {} },
  "tests": [{ "file": "00_harness/stub_smoke.test.sql", "passed": 77, "failed": 0, "aborted": null, "failures": [], "notes": ["only when the file emits some"] }],
  "problems": []
}
```

## What a run does

### 1. Binaries and cluster

Binaries: `--pg-bin`, else `pg_config --bindir`, else the highest `/usr/lib/postgresql/<n>/bin`, else `PATH`. A directory counts when it has `initdb`, `pg_ctl`, `postgres` and `psql` and `postgres --version` is 15 or newer (`security_invoker` views).

The cluster is `/tmp/storm-pg-<pid>/` with `data/`, the socket directory `s/` (unix socket paths must stay under 107 bytes, so never under the scratchpad) and `server.log`. `initdb -U postgres -A trust -E UTF8 --locale=C.UTF-8` (`--locale=C` when the system has no C.UTF-8); the server listens on the socket only (`listen_addresses=''`, a free port picked on 127.0.0.1 names the socket), with `fsync`, `synchronous_commit` and `full_page_writes` off. PostgreSQL refuses to run as root, so when the uid is 0 the directory is chowned to `postgres` and `initdb` / `pg_ctl` run through `runuser -u postgres --`; `psql` runs as the current user. Teardown runs on success, failure, `SIGINT`, `SIGTERM`, `SIGHUP`, uncaught errors and process exit: it kills the psql and node helper processes still running, removes the contract phase's schema snapshots (`$TMPDIR/storm-schema-legacy-<pid>.json`, `$TMPDIR/storm-schema-buildout-<pid>.json`; also with `--keep`, which keeps only the cluster), then stops the cluster (`pg_ctl stop -m immediate`) and removes its directory (`rm -rf`); a directory it cannot remove is reported as a `WARNING` with the stop command, never as removed. A cluster left by a crashed run (its pid gone, no `KEPT` marker) is removed by the next run, which says `removed stale cluster …` only when the directory is gone, else `WARNING: could not remove stale cluster …; remove it by hand`.

Locale note: the harness runs in `C.UTF-8`, Supabase in `en_US.UTF-8`. SQL that must agree with JS on letter case (vessel codes, D-03) uses `translate()` for ASCII, never `upper()` / `lower()`.

### 2. Supabase stub (`supabase/tests/harness/supabase-stub.sql`)

Loaded as the superuser before the replay; it makes a migration behave as it would live:

- roles `anon`, `authenticated`, `service_role` (`BYPASSRLS`), `authenticator`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `supabase_realtime_admin`, `sandbox_exec` (Lovable's import grants);
- `auth.users` with Supabase's columns (incl. `banned_until`, `deleted_at`, `is_anonymous`, generated `confirmed_at`), `auth.identities`, `auth.sessions`, `auth.refresh_tokens` (`user_id varchar`, as in Supabase); `auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()` exactly as Supabase defines them (`request.jwt.claim.<name>` first, then `request.jwt.claims`);
- `storage.buckets` and `storage.objects` (RLS on, generated `path_tokens`), `storage.foldername()` / `filename()` / `extension()`;
- `pgcrypto`, `pg_trgm`, `citext`, `uuid-ossp` in schema `extensions`, with the database `search_path` `"$user", public, extensions`;
- schema `cron` with `cron.job` and `cron.schedule()` / `unschedule()` (pg_cron itself is not installed, so the legacy guarded registrations skip, as on a project without it); empty schema `realtime`; publication `supabase_realtime`;
- Supabase's default privileges: ALL on new public tables and sequences and EXECUTE on new public functions granted **directly** to `anon`, `authenticated` and `service_role`. A migration that only revokes from `PUBLIC` leaves the browser roles able to call its function here exactly as live (rule 5, CC-1), and the ACL tests catch it.

It is not a Supabase install: no GoTrue, PostgREST or storage API. The test library drives roles and claims.

### 3. Legacy replay (`supabase/tests/harness/replay.json`)

Every file with a version before `20261123000000` replays in version order (the accepted duplicate `20260919120000` in file-name order), each in its own transaction (`psql -1 -v ON_ERROR_STOP=1`). The replay models the live database after the ledger's Apply queue: the `unknown` rows (12, 21, 22, 23, 27) apply, which is also what Phase 2 requires before file 3 (rows 12 and 23 are hard prerequisites, spec §0.1).

`replay.json` governs the exceptions; unlisted files are `apply`:

```json
{
  "version": 1,
  "files": {
    "<file name>": {
      "action": "apply | expect_failure | skip",
      "driftBefore": ["drift/<patch>.sql"],
      "reason": "required for expect_failure and skip",
      "evidence": "required for expect_failure",
      "errorMatch": "required for expect_failure: a substring of the error",
      "supersededBy": "for skip: the legacy file that carries the same statements"
    }
  },
  "fidelityExceptions": { "tables": {}, "views": {}, "columns": { "<table>.<column>": "reason" }, "functions": {} }
}
```

An unexpected failure fails the run; so does an `expect_failure` that applies (remove the entry) or fails with a different error. `node --test scripts/db/test/migrations.test.mjs` validates the file (unknown action, missing reason / evidence / errorMatch, unknown file, missing or misplaced drift patch, unknown keys).

Current entries:

| File | Action | Why |
|---|---|---|
| `20260228120000_create_feedback_submissions.sql` | skip | not applied live (ledger row 1; held in the Apply queue until X6) |
| `20260428170829_00553f3f-…sql` | apply + `drift/legacy_seed_company.sql` | its vessel seed needs company `11111111-…`, which existed live (Lovable ran the file) but no migration creates; without it the file rolls back and takes `profiles.airtable_id` / `imported_vessel_id` with it, and four later files fail in turn |
| `20260917113000_hris_phase1_followups.sql` | expect_failure `text = uuid` | never ran live as written: its Lovable copy `20260917175431_…` is the corrected text (`audit_logs.entity_id::text`) and replays here |
| `20260917140000_hris_phase4_recruitment_onboarding_rtw.sql` | apply + `drift/profiles_visa_expiry.sql` | needs `profiles.visa_expiry`, which the failed row-7 file adds; live, the column existed when the phase 4 copy ran |
| `20260917150000_hris_phase5_retention.sql` | expect_failure `text = uuid` | as row 7: its Lovable copy `20260917181151_…` is the corrected text and replays here |

`audit_logs.entity_id` is `uuid` live (created `UUID NOT NULL`; the Lovable copies cast `entity_id::text` and insert uuid values where the hand-written files inserted text), so the HRIS `text = uuid` failure is not a column-type drift and no patch changes the column.

#### Adding a drift patch

Use one when an object exists live (it is in `src/integrations/supabase/types.ts`, or a Lovable copy proves it) but the replay does not have it when a file needs it. Drift patches reproduce live **schema state** only: columns, column types, roles, rows a seed needs. They never create operators, casts or functions that change how a statement is evaluated (CC-25), and legacy migration files are never edited.

1. Write `supabase/tests/harness/drift/<name>.sql` (lower case, `[a-z0-9_.-]`), idempotent (`ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, …), the smallest change that reproduces live, with this header:

   ```sql
   -- Drift patch: <what>.
   --
   -- Before: <the migration file it runs before>
   -- Live state reproduced: <the column / row / role>
   -- Evidence: <types.ts line, Lovable copy and line, ledger row>
   ```

2. Add it to the file's `driftBefore` in `replay.json`, with a `reason`.
3. Run `node --test scripts/db/test/migrations.test.mjs` (header, evidence and no-function checks) and the harness.

Prefer a drift patch over `expect_failure`: a failed file loses every later statement in it, and its dependants fail in turn.

#### Adding an `expect_failure`

Only when the file genuinely failed (or never ran) live as written, with evidence: the error, and why live differs (the Lovable copy that replaced it, the ledger row). Give `reason`, `evidence` and an `errorMatch` substring of the error the harness reports. Use `skip` with `supersededBy` (or a `reason`) for a file that must not run at all.

### 4. Fidelity (`scripts/db/fidelity.mjs`)

After the replay, before the build-out: parses `src/integrations/supabase/types.ts` with the repo's TypeScript compiler API and compares `Database.public` (tables, views, Row columns, functions) with the replayed database (`pg_catalog`). A table, view, column or function that `types.ts` has and the database does not fails the run unless `fidelityExceptions` explains it. Warnings (in the report and with `--verbose`): nullability and type-class differences on tables, function argument names that match no overload, enum labels, objects the database has and `types.ts` does not, and stale exceptions. Today: 0 unexplained misses, 1 explained (`dev_todos`, created live outside migrations), 0 warnings.

Standalone, against a kept cluster:

```bash
node scripts/db/fidelity.mjs --psql "-h /tmp/storm-pg-<pid>/s -p <port> -U postgres -d storm" --psql-bin /usr/lib/postgresql/16/bin/psql [--json]
```

### 5. Build-out (files from `20261123000000`)

Pass 1 applies every build-out file in order, each in its own transaction (stops at the first failure); pass 2 applies them all again, the real idempotency proof (every failure is reported). With no build-out file both passes are trivially green. Before applying, the harness reads the files and fails when a function, view or policy (by name, and by table for policies) is created in more than one build-out file, or a legacy function is redefined in more than one (rule §0.2, D-120): re-running an earlier file must never revert a later file's definition. Statements inside `DO` blocks and function bodies are not read.

### 6. Contract (`scripts/db/schema-export.mjs`, `check-pending-contract.mjs`, `contract-map.json`)

The client reads every build-out table, column and RPC through hand-written pending types (`*/db.pending.ts`, spec §B.1) until the owner regenerates `types.ts`. This phase proves those types mirror the SQL (spec §D.7):

1. After the legacy replay, `schema-export.mjs --psql … --psql-bin … --out <legacy.json>` snapshots the public schema: every table and view with its columns (`format_type`, nullability, default, enum labels, single-column CHECKs and, when a CHECK is exactly an `IN (…)` list, its values) and every function by identity (argument names, modes and defaults, return type, set / relation / enum returns, SECURITY DEFINER, volatility, language, EXECUTE grantees, a body hash).
2. After the build-out, `schema-export.mjs … --baseline <legacy.json> --out <export.json>` writes only what the build-out added or changed: new tables and views, new columns on legacy tables, new or redefined functions.

The two snapshots are `$TMPDIR/storm-schema-legacy-<pid>.json` and `$TMPDIR/storm-schema-buildout-<pid>.json`. They live only for the run: the phase removes them when it is done, and teardown removes them on every other exit (a failed build-out that skips the phase, a signal, an error), with `--keep` too.
3. `check-pending-contract.mjs --export <export.json> --json` loads the files and type names of `contract-map.json` with a TypeScript Program + TypeChecker (`@/` -> `src/`, `strictNullChecks` on so `| null` survives) and fails on a missing table / view / column / function, a type or nullability mismatch (tables and new columns; view columns are always nullable in the catalogue), a literal union without an `IN (…)` CHECK or a CHECK without its union (CC-13; on a view, a union is a warning: views carry no CHECK), an argument name or optionality (`?` = has a DEFAULT) mismatch, a return-shape mismatch (the table's row type for `RETURNS <table>`, `T[]` for `SETOF`), a pending function `authenticated` cannot execute, and any new table, view, legacy column or browser-executable function that no pending file declares.

`contract-map.json` governs it: `files` (= spec §B.1: each pending file, its type names and the names it must declare), `notMirrored` (new objects the browser never calls, each with a reason: the service-only outbox, RLS predicates, pure helpers) and `knownMismatches` (`{ key, followup }`: a reported mismatch whose fix is a Lane 2 followup; listed, not failed). A `notMirrored` or `knownMismatches` entry that no longer matches anything fails the run ("remove the entry"), so the map cannot rot. The checker never edits a TS file. Warnings (never failures) name view unions and legacy functions in `types.ts` that the browser can no longer execute.

#### Per-stream fragments (Phase 3 wave 1)

Two streams build in one tree and commit by explicit path, so the shared inventories take one fragment per stream beside the main file, and the main files stay platform-only. `scripts/db/lib/fragments.mjs` merges them in file-name order; a name two files claim is an error, never a silent override. The integrator folds the fragments into the main files at the wave merge.

| Main file | Fragments (X1: `crew.json`, X5: `fleet.json`) | Merge rule | Read by |
|---|---|---|---|
| `scripts/db/contract-map.json` | `scripts/db/contract-map.d/*.json`, `{ "version": 1, "files": [], "notMirrored": {}, "knownMismatches"?: [] }` | `files[]` concatenated (a `file` named twice fails); `notMirrored.{tables, views, functions, columns}` merged (a key twice fails); `knownMismatches` concatenated (a key twice fails) | `check-pending-contract.mjs` (the `<map>.d/` directory beside `--map`). Every check, the stale ones included, runs on the merged map; a stale entry names the fragment that holds it; a duplicate is a `map:fragment` mismatch (exit 1) |
| `supabase/tests/fixtures/function-grants.json` | `supabase/tests/fixtures/function-grants.d/*.json`, `{ "functions"?: {…}, "relations"?: {…} }` (seeded `{}`) | merged by key (a key twice fails) | `zz_platform/acl.test.sql` through `node scripts/db/lib/fragments.mjs grants` |
| the probe list of `p3_user_status/inactive_gates.test.sql` | `supabase/tests/fixtures/inactive-probes.d/*.json`, an array of `{ "probe": { "callee", "expr" } }` or `{ "allow": { "callee", "reason" } }` (seeded `[]`) | concatenated (a callee twice fails; a callee the test already lists is a primary-key error) | `inactive_gates.test.sql` through `node scripts/db/lib/fragments.mjs probes`. In an `expr`, `{company:A}`, `{vessel:A.dra}`, `{user:A.crew_hyd}` and `{profile:…}` become the quoted ids of `tests.company_id()`, `tests.vessel_id()`, `tests.user_id()`, `tests.profile_id()` (the `seed_two_tenants()` world); any other `{word:` token fails the file |

`node scripts/db/lib/fragments.mjs grants|probes|contract-map [--root <repo>]` prints the merged JSON and exits 0, or prints nothing on stdout, the problems on stderr, and exits 1. The ACL and inventory tests also glob the stream files: `supabase/migrations/2026112[34]*.sql` (functions, relations and policies of `20261124*` files are held to the same rules as the platform's).

Run it alone on a kept cluster:

```bash
flock /tmp/storm-db.lock node scripts/db/harness.mjs --no-tests --keep   # prints the psql line
node scripts/db/schema-export.mjs --psql "-h <socket dir> -p <port> -U postgres -d storm" --out /tmp/after.json   # a full snapshot
node scripts/db/check-pending-contract.mjs --export <export.json>        # an export made with --baseline
```

### 7. SQL tests (`supabase/tests/sql/**/*.test.sql`)

After pass 2 the harness loads `supabase/tests/harness/testlib.sql` and runs each test file, sorted by path, in its own transaction that is rolled back:

```
BEGIN; SELECT tests._start('<file>'); \i <file>; SELECT tests._finish(); ROLLBACK;
```

psql runs with `ON_ERROR_STOP` and its working directory at the repo root, so a test can load a fixture with ``\set fixture `cat supabase/tests/fixtures/reach-cases.json` `` and use `:'fixture'::jsonb`. A test may also emit informational notes with `RAISE NOTICE '# <text>'` (inside a `DO` block): they are kept in the JSON report as `tests[].notes` (e.g. the policy inventory's residual list in `p3_user_status/policy_inventory.test.sql`) and printed with `--verbose`; they are not assertions. An error aborts the file (`not ok - <file>: aborted: <error>`); so does a file with no assertion. A test file must not `COMMIT`, `ROLLBACK` or `\q` (savepoints are fine) and must not raise `client_min_messages` above `notice`.

One directory per item: `00_harness/`, `p1_vessel_tenancy/`, `p2_memberships/`, `p2_reach/`, `p2_capabilities/`, `p2_module_settings/`, `p2_reference/`, `p3_user_status/`, `p3_access_rls/`, `p3_invitations/`, `p4_registry/`, `p4_signatures/`, `p4_threads/`, `p4_files/`, `p4_exports/`, `p5_notifications/`, `zz_platform/` (runs last).

#### Library (schema `tests`)

| Function | Passes when |
|---|---|
| `tests.ok(cond, description)` | `cond` is true (NULL fails) |
| `tests.is(got, want, description)` / `tests.isnt(got, unwanted, description)` | `got IS NOT DISTINCT FROM want` (`anycompatible`: `tests.is(count(*), 3, …)` works) |
| `tests.is_empty(sql, description)` | the query returns no row |
| `tests.results_eq(sql, want_sql, description)` | same rows in any order, duplicates counted |
| `tests.throws(sql, sqlstate DEFAULT NULL, description)` | the statement raises (that SQLSTATE when given) |
| `tests.throws_like(sql, sqlstate, message_like, description)` | it raises with that SQLSTATE (NULL: any) and a message `LIKE` the pattern |
| `tests.lives(sql, description)` | it runs without error (its effects stay) |
| `tests.denied(sql, description)` | it raises `42501` (grant, function ACL, RLS `WITH CHECK`) or returns / changes no row (RLS filtering); give a row-returning query (`SELECT * …`, not `count(*)`) |

Assertions that run SQL run it **as the current role**, inside a sub-block, so RLS and grants apply; their errors are recorded as failures and the file goes on. `throws`, `throws_like` and `denied` roll back the statement's effects.

| Role switch | Effect |
|---|---|
| `tests.as_user(uid, extra_claims DEFAULT '{}')` | `SET LOCAL ROLE authenticated`; `request.jwt.claims` = `{sub, role: authenticated, aud, email, aal, is_anonymous} || extra_claims`, and `request.jwt.claim.sub` / `.role` / `.email` |
| `tests.as_anon()` | role `anon`, claims `{role: anon}` |
| `tests.as_service()` | role `service_role` (bypasses RLS), claims `{role: service_role}` |
| `tests.reset_role()` | back to the superuser with no JWT (as the SQL editor or a migration runs: `auth.uid()` is NULL) |

Ids are deterministic: `tests.id(key)` is the md5 uuid of the key, and `tests.company_id(key)`, `vessel_id(key)`, `user_id(key)` (the auth user), `profile_id(key)` are `tests.id('<kind>:' || key)`. Emails are `tests.email(key)`: the key in lower case with dots as dashes, `@example.test`.

Seeders (SECURITY DEFINER, idempotent per key, run with the JWT claims suspended so no trigger mistakes a seed for a user action; role words and example.test addresses only):

| Seeder | Creates |
|---|---|
| `tests.seed_company(key, name DEFAULT 'Company <key>', extra DEFAULT '{}')` | a company |
| `tests.seed_vessel(company_key, key, name DEFAULT upper(key suffix), status DEFAULT 'Active', code DEFAULT NULL, created_at DEFAULT now(), extra DEFAULT '{}')` | a vessel (`code` only when given; `extra` sets any column, e.g. `'{"lifecycle_status": "archived"}'`) |
| `tests.seed_auth_user(key, extra DEFAULT '{}')` | an `auth.users` row (e.g. `'{"banned_until": "2099-01-01"}'`) |
| `tests.seed_profile(company_key, key, profile_role DEFAULT 'crew', account_status DEFAULT 'active', user_key DEFAULT NULL, extra DEFAULT '{}')` | a profile (no login unless `user_key`); names `<Role word>` / `<key>` |
| `tests.seed_user(company_key, key, profile_role DEFAULT 'crew', account_status DEFAULT 'active', extra DEFAULT '{}')` | a login and its profile; returns the auth user id |
| `tests.seed_assignment(user_key, vessel_key, is_current DEFAULT true, position DEFAULT 'Crew', extra DEFAULT '{}')` | a crew assignment (ended yesterday when not current) |
| `tests.seed_role(name, default_scope DEFAULT 'vessel')` | a custom RBAC role (the seeded ones exist already) |
| `tests.seed_rbac_role(user_key, role_name, vessel_key DEFAULT NULL, is_active DEFAULT true, valid_until DEFAULT NULL)` | an `rbac_user_roles` row |
| `tests.seed_user_role(user_key, app_role, company_key DEFAULT NULL, is_active DEFAULT true, expires_at DEFAULT NULL)` | a legacy `user_roles` row |
| `tests.seed_two_tenants()` | companies A and B; vessels `A.dra` (M/Y DRAAK), `A.hyd` (HYDRA), `A.gam` (GAME CHANGER), `B.lev` (LEVIATHAN); `A.fleet_manager` (dpa), `A.master_dra` (master on A.dra), `A.crew_hyd` (crew on A.hyd), `A.disabled` (crew, `account_status` disabled), `B.admin` (dpa); returns the ids as jsonb |

D2 adds `tests.seed_reach_world(fixture jsonb)` (the whole `reach-cases.json` world).

#### Template: tests for a new table

Every new table gets at least two-tenant isolation (company B sees nothing of A through the table and its functions), anon denied, the role matrix of its policies, and a forged-id attempt; the second build-out pass covers the idempotent re-run. For a hypothetical `public.example_items (id, company_id, vessel_id, title)`:

```sql
-- supabase/tests/sql/p9_example/example_items.test.sql
SELECT tests.seed_two_tenants();
-- arrange as the superuser (RLS does not apply), with deterministic ids
INSERT INTO public.example_items (id, company_id, vessel_id, title) VALUES
  (tests.id('item:A'), tests.company_id('A'), tests.vessel_id('A.dra'), 'Item on DRA'),
  (tests.id('item:B'), tests.company_id('B'), tests.vessel_id('B.lev'), 'Item on LEV');

-- 1. two-tenant isolation (the table and its functions)
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is_empty(format('SELECT 1 FROM public.example_items WHERE company_id = %L', tests.company_id('A')), 'company B sees no item of company A');
SELECT tests.is(public.example_item_count(tests.company_id('A')), 0, 'the count function answers nothing for another company');

-- 2. anon denied (reads and writes)
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.example_items', 'anon reads nothing');
SELECT tests.denied(format($q$INSERT INTO public.example_items (company_id, vessel_id, title) VALUES (%L, %L, 'x')$q$, tests.company_id('A'), tests.vessel_id('A.dra')), 'anon cannot insert');

-- 3. role matrix of the policies
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.example_items), 1::bigint, 'the master sees the item on their vessel');
SELECT tests.lives(format($q$INSERT INTO public.example_items (company_id, vessel_id, title) VALUES (%L, %L, 'new')$q$, tests.company_id('A'), tests.vessel_id('A.dra')), 'the master writes on their vessel');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty('SELECT 1 FROM public.example_items', 'crew on another vessel sees nothing');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty('SELECT 1 FROM public.example_items', 'a disabled user gets nothing');

-- 4. forged ids: a client-supplied company / vessel of another tenant is refused
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws(format($q$INSERT INTO public.example_items (company_id, vessel_id, title) VALUES (%L, %L, 'forged')$q$, tests.company_id('B'), tests.vessel_id('B.lev')), '42501', 'a forged company id is refused (WITH CHECK)');
SELECT tests.denied(format($q$UPDATE public.example_items SET title = 'x' WHERE id = %L$q$, tests.id('item:B')), 'another tenant''s row cannot be updated');

-- 5. grants and ACLs (rule 4, rule 5)
SELECT tests.reset_role();
SELECT tests.ok(NOT has_table_privilege('anon', 'public.example_items', 'SELECT'), 'anon has no grant on the table');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.example_internal(uuid)', 'EXECUTE'), 'the service-only function is not callable from the browser');
```

## Debugging with `--keep`

```bash
flock /tmp/storm-db.lock node scripts/db/harness.mjs --keep --tests 'p2_*/**'
# connect: /usr/lib/postgresql/16/bin/psql -h /tmp/storm-pg-<pid>/s -p <port> -U postgres storm
# stop:    runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/storm-pg-<pid>/data -m immediate stop && rm -rf /tmp/storm-pg-<pid>
```

The kept database holds the replay, the build-out and the test library (each test file rolled back, so no test data). To replay a test by hand: `psql … -c "BEGIN" -f supabase/tests/sql/<file> …` from the repo root, or paste its statements inside `BEGIN; … ROLLBACK;`. `server.log` in the cluster directory has the server's own messages. Stop the cluster when done: a kept cluster carries a `KEPT` marker, so later runs leave it alone (they never reuse it).

## Files

| Path | What |
|---|---|
| `scripts/db/harness.mjs` | the CLI and the phases |
| `scripts/db/fidelity.mjs` | the `types.ts` comparison (library and CLI) |
| `scripts/db/schema-export.mjs` | schema snapshot and build-out export (library and CLI) |
| `scripts/db/check-pending-contract.mjs`, `contract-map.json`, `contract-map.d/*.json` | the pending-type contract check, its map and the per-stream map fragments |
| `scripts/db/lib/fragments.mjs` | the per-stream fragment merge (contract map, function grants, inactive-gate probes; library and CLI) |
| `scripts/db/lib/cli.mjs` | flags and usage |
| `scripts/db/lib/pg.mjs` | binary discovery, cluster start / stop |
| `scripts/db/lib/psql.mjs` | psql runner, error extraction |
| `scripts/db/lib/migrations.mjs` | version order, `replay.json` validation and verdicts |
| `scripts/db/lib/sql.mjs` | statement splitter, one-definition scanner |
| `scripts/db/lib/tests.mjs` | test discovery, globs, wrapper, TAP parsing |
| `scripts/db/test/*.test.mjs` | `node --test` unit tests (no cluster), plus `harness-lifecycle.test.mjs`: a failing build-out, a `SIGTERM`, an `initdb` failure and a late usage error each leave no cluster and no schema snapshot, and a report whose `exitCode` is the exit code (real throwaway clusters, each run through the lock; skipped without PostgreSQL or `flock`), and `last-manager-race.test.mjs` (see below) |
| `scripts/db/test/last-manager-race.test.mjs` | the one concurrency test (the SQL runner is single-session): it starts a kept cluster through the lock (`flock -w 900 /tmp/storm-db.lock node scripts/db/harness.mjs --keep --no-fidelity --no-contract --tests '00_harness/**'`), reads the printed `connect` and `stop` lines, seeds company RC with two dpa users (the only managers of admins), and races two psql sessions as `service_role` that disable each other with `set_membership_status`, the first holding its transaction open for 4 s. It asserts that the first commits, the second is refused (`not_permitted` or `last_manager_of_admins`: `lock_company_admin_managers()` makes it wait and then see its actor disabled) and at least one active manager of admins remains; the cluster is stopped in `finally`. Skipped without PostgreSQL or `flock`; never run it under the lock |
| `supabase/tests/harness/supabase-stub.sql` | the Supabase stub |
| `supabase/tests/harness/testlib.sql` | the `tests` schema |
| `supabase/tests/harness/replay.json`, `drift/*.sql` | replay governance and drift patches |
| `supabase/tests/sql/**/*.test.sql` | SQL tests |
| `supabase/tests/fixtures/*.json` | fixtures shared with the TS tests; `function-grants.json` (plus `function-grants.d/*.json`) is the ACL inventory asserted by `zz_platform/acl.test.sql`; `inactive-probes.d/*.json` are the streams' inactive-gate probes |
| `scripts/db/gen-*.mjs` | fixture generators from the frozen TS engines (`--check` exits 1 when a fixture is out of date): `gen-vessel-code-corpus.mjs`, `gen-reference-fixture.mjs`, `gen-module-settings-fixture.mjs`, `gen-record-fixtures.mjs` (record-transitions, record-vessel-lock, record-signature-scenarios, record-thread-scenarios), `gen-capability-cases.mjs` (`capability-cases.json`: the client adaptor `resolveCapability()` over a persona matrix for every crew key `has_capability_for` answers; `p2_capabilities/crew_keys.test.sql` seeds the personas, asserts parity and runs the generator with `--check`, so the fixture must be regenerated whenever the adaptor, the catalogue, `canAccessModule`'s tables in `AuthContext.tsx` or `CREW_CAPABILITY_KEYS` change) |

`STORM_DB_MIGRATIONS_DIR=<dir>` points the harness at another migrations directory; it exists only for testing the harness itself (a scratch copy of the migrations plus synthetic build-out files).

## CI

npm scripts: `npm run test:db` (`node scripts/db/harness.mjs`), `npm run test:db:unit` (`node --test scripts/db/test/*.test.mjs`) and `npm run test:fixtures` (the four fixture generators with `--check`). Locally, run the harness through the lock as above.

The `db` job in `.github/workflows/ci.yml` runs on `ubuntu-latest` (Node 22, `npm ci`; PostgreSQL binaries from `/usr/lib/postgresql/*/bin`, else `sudo apt-get install -y postgresql`) with a 20-minute timeout: the unit tests, the fixture check, then the full harness with `--report "$RUNNER_TEMP/storm-db-report.json"`, uploaded as the `storm-db-report` artifact. The runner is not root, so `runuser` is not needed there.
