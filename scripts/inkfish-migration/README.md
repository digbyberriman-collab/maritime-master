# Inkfish backup migration preflight

This tool inspects a PostgreSQL custom-format archive and maps its fields to the
repository's generated Supabase types. It never connects to a database or executes
archive SQL. It is a **source-only preflight**, not an approved reconciliation or
a deployable migration. There is no apply/delete mode.

## Run

Requires Python 3.10+ and `pg_restore` supporting the archive version and
compression. The supplied September 2026 archive requires format 1.16 and zstd;
PostgreSQL 18.6 was used for inspection. No Python packages are needed.

```powershell
python scripts/inkfish-migration/preflight.py `
  --archive 'C:\private\dive-operations_260917.backup.zip' `
  --pg-restore 'C:\tools\postgresql\bin\pg_restore.exe' `
  --repository . `
  --output 'C:\private\inkfish-preflight-new'
python -m unittest discover -s scripts/inkfish-migration -p 'test_*.py'
```

Use a new output directory outside the checkout. It contains confidential schema,
storage paths, and hashed relational keys. The original archive is never modified.
ZIP members are copied to a fixed filename, never an archive-supplied path. SQL is
rendered to private files or streamed through a bounded reader, never restored.
The default row inspection limit is 16 MiB and total expansion limit is 128 GiB.
Oversize rows are counted but excluded from relational checks; they must be
resolved before deployment. A failed run does not produce `source-report.json`.

Outputs:

- `metadata.json`: archive checksum, repository overlap and deployment status.
- `source-report.json`: table counts, candidate duplicate groups, unmatched
  declared foreign keys, required-field findings, storage counts and limitations.
- `table-inventory.csv`: table-level counts and byte sizes.
- `field-mapping.csv`: every source column and any same-named destination candidate.
- `storage-manifest.jsonl`: private storage metadata for a later transfer job.
- `source-schema.sql`, `source.toc`, `schema-inventory.json`: source evidence.
- `relational-checks.sqlite`: private hashed key index supporting the checks.

The tool compares COPY text values, not PostgreSQL type/collation semantics. It
does not validate SQL CHECK expressions, partial/expression unique indexes,
generated columns, triggers, login, or RLS. Row counts include oversized rows;
unmatched references to tables with skipped rows may be false positives. Duplicate
candidates are not automatic merges. An empty same-name mapping is not a deletion
instruction. Full source SQL and raw backup data must never enter Git.

## Migration policy and pending work

Preserve source UUIDs and destination authentication links. If a source and
destination auth UUID conflict for the same email, quarantine the case: choosing
either UUID would break the other account's relationships. Keep an explicit
source-to-target crosswalk; remap every dependent foreign key transactionally.

Use source values for confirmed record conflicts, preserve complementary values,
and retain source timestamps. Never infer companies/tenants from a vessel name or
assign imported users elevated roles from unverified source role strings.

1. Collect staging and production baselines with `destination-inventory.sql` and
   private row exports. Repository types are not evidence of live database state.
2. Review every same-name table semantically, particularly `profiles`, `vessels`,
   `companies`, `user_roles`, and documents. Resolve tenant mappings and account
   UUID conflicts before preparing any writes.
3. Preserve existing normalized source entities and join tables. Create reviewed
   target DDL only after resolving enum/function dependencies and destination
   ownership. Keep clinical data in restricted tables with validated RLS. Do not
   transplant source functions, triggers, grants, scheduled jobs, tokens, sessions,
   or platform migration history into the running target.
4. Generate exact inserts, complementary merges, source-wins replacements,
   crosswalks, quarantines, and deletion candidates from frozen baselines. Bind the
   plan to source checksum, destination snapshot and target commit. Stop if any
   baseline changes. Destination-only records remain unresolved until reviewed.
5. Obtain approval of that concrete dry-run report before destructive changes.
6. Snapshot staging database and storage, apply in transactions with constraints
   enabled, then reconcile counts, all references, merged fields, auth login and
   tenant access. Verify file byte hashes and document retrieval.
7. Snapshot production and storage; repeat only after staging passes and approved
   changes still match the production baseline. Keep a write freeze during final
   comparison/cutover. Restore snapshots and matching application commit if any
   validation fails. Rehearse rollback and measure downtime on staging first.

Storage metadata is not file content. Transfer source objects separately, preserving
owner links and document access rules. Hash the bytes before deciding whether files
are duplicates; metadata ETags are not assumed to be content SHA-256 hashes.
Source integration credentials may be encrypted for another project and need
reconfiguration, not blind copying. Auth identities require compatible platform
schemas and provider configuration; keeping rows alone does not prove login works.

References: [PostgreSQL pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html),
[Supabase database backups](https://supabase.com/docs/guides/platform/backups),
[Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
