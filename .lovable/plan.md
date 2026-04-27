
# Migrating this app into a different-workspace Lovable project

## Constraints to know up front

- **Cross-workspace tools don't reach the destination.** Lovable's cross-project read/copy tools are workspace-scoped, so I cannot inspect the destination project from here. We need to bring the two projects into the same workspace first.
- **This database has only one company** — `Sample Yacht Management` (`11111111-1111-1111-1111-111111111111`). Every row in every tenant table is scoped to this company, which makes "real vs demo" easy to separate: by default everything here is demo, and you'll tell me which specific rows are real before we move them.
- **Scale of what we're moving:** 23 frontend modules, 145 public tables, 25 edge functions, 50 schema migrations, 7 storage buckets, an RBAC system, and Lovable Cloud secrets.

## Step 1 — Get both projects into one workspace

You picked "Transfer this project to that workspace." Concrete steps:

1. In **this** project: top-left project name → **Settings → Transfer workspace** → pick the destination workspace.
2. After transfer, both projects are visible to me in the destination workspace, and I can finally read the destination's code, schema, and assets via the cross-project tools.
3. **Do not delete this project after transfer** — we'll keep it as the read-only source of truth until migration is complete and verified.

If transfer is blocked (e.g. you're not an admin in the destination workspace, or workspace policy disallows it), the fallback is the GitHub route: connect this project to GitHub, give me read access to the destination, and we mirror the same plan against a branch.

## Step 2 — Discovery in the destination project

Once both projects sit in the same workspace, I'll do a structured audit and produce a written **Migration Mapping Document** covering:

- **Schema diff** — for each of the 145 tables here, mark as: `exists in destination` / `partial match` / `missing`. For matches, map column-by-column (including type and nullability differences).
- **Module diff** — for each frontend module (crew, certificates, incidents, …), mark as: `destination has equivalent` / `destination has stub` / `not present`.
- **Auth & RBAC diff** — compare the two role systems (this project uses both a legacy `user_roles` enum table and the newer `rbac_user_roles` + `roles` + `role_permissions` matrix). The destination almost certainly has its own; we need an explicit role-to-role mapping.
- **Edge function diff** — list the 25 functions and whether the destination has an equivalent, a different name, or none.
- **Storage bucket diff** — 7 buckets here (`client-logos`, `documents`, `incident-attachments`, `crew-travel-documents`, `trip-suggestion-attachments`, `development-documents`, `dev-todo-images`).
- **Secrets diff** — list missing secrets the destination will need (Airtable key, Lovable AI key are already here; service-role/anon are auto-provisioned).

You review and approve this document before any code or data moves. This is the single most important artifact in the migration.

## Step 3 — Code migration (module-by-module, not big-bang)

We port modules in dependency order so the destination stays buildable at every step:

```text
Foundation        → companies, profiles, vessels, RBAC, auth
Operational core  → crew, certificates, alerts, dashboard
Compliance        → incidents, audits, drills, risk-assessments, ism, training
Workflow          → maintenance, documents, flights, itinerary
Auxiliary         → development, emergency, feedback, analytics, red-room, settings
```

For each module:
1. Copy the module folder from `src/modules/<name>/` into the destination, **renaming imports** to match destination paths.
2. Reconcile shared dependencies (`src/shared/*`, `src/components/ui/*`, `src/lib/*`) — adopt the destination's version where it already exists; only add files that don't.
3. Wire routes into the destination's `src/routes/index.tsx` (or equivalent).
4. Run a build after each module. Don't move on while the destination is broken.

Modules that overlap with destination features (e.g. if destination already has a Crew page) become **merge** rather than **copy**: I'll diff the two implementations and bring across only the missing fields/screens, preserving the destination's UI conventions.

## Step 4 — Schema migration

Three categories, handled differently:

- **Tables the destination already has** → write `ALTER TABLE` migrations to add only the missing columns/indexes. Never drop existing columns.
- **Tables that exist with a different shape** → keep destination's table, add a thin compatibility view or extra columns; rewrite this project's hooks to read from the destination's column names.
- **Tables that don't exist at all** → port the original `CREATE TABLE` migration plus its RLS policies, security-definer functions, and triggers. The 50 migrations in `supabase/migrations/` are the source.

Special attention required for:
- **RBAC tables** (`roles`, `role_permissions`, `rbac_user_roles`, `user_permission_overrides`, `permission_audit_log`, `modules`) — these are foundational; if destination has its own role model, we map roles 1:1 in a translation table rather than overwriting.
- **Database functions** — 30+ security-definer functions (`get_red_room_items`, `get_vessel_dashboard_summary`, `assign_alert_task`, `has_role`, `user_has_permission`, etc.). Each must be ported and re-pointed at destination column names if they changed.
- **Storage buckets and their policies** — recreated in destination via migration.

## Step 5 — Selective data migration

You chose "everything except obvious demo/seed rows." Mechanically:

1. **Tag what's real.** Because there's only one company here, I'll generate a short worksheet listing each top-level entity (companies, profiles, vessels, crew, etc.) with row counts (e.g. 6 vessels, 14 profiles, 7 incidents, 17 crew assignments). You mark each row "real" or "demo." Anything unmarked defaults to demo and is skipped.
2. **Map IDs.** Real rows usually need to slot into existing destination records (e.g. your real company already exists in the destination with a different UUID). Mapping table: `(this_project_table, this_project_id) → (destination_table, destination_id)`.
3. **Export → transform → import.** For each table being moved, dump rows as CSV/JSON, rewrite foreign keys via the ID map, then insert into destination. Run inside a transaction per table; abort the table on first FK violation rather than partially loading.
4. **Storage objects.** For real records that have associated files (crew documents, incident attachments, certificates), download from this project's buckets and re-upload to destination's buckets, updating the stored URLs.
5. **Order matters.** Load companies → profiles → vessels → crew_assignments → everything else, respecting FK direction.

Demo data simply isn't moved. The destination keeps its own real data untouched.

## Step 6 — Edge functions, secrets, and integrations

- Re-deploy the 25 edge functions into the destination (they get auto-deployed by Lovable once the files exist).
- You add any missing secrets in the destination's Cloud settings (I'll give you the exact list from Step 2).
- Reconfigure third-party hooks: Airtable sync map, webhook configurations, integration API keys — these are environment-specific and should be re-pointed, not copied.

## Step 7 — Verification

Before we call it done:
- Build passes in destination.
- Auth flow works end-to-end in destination (login, role check, RLS).
- Spot-check each migrated module against a real record (open it, edit it, save it).
- Compare row counts: `(real rows expected to move) == (rows actually in destination after migration)`.
- Run the Supabase linter against the destination schema to catch RLS gaps introduced by the new tables.

## Step 8 — Decommission source

Once you've signed off, this project gets archived (not deleted) so we have a rollback point for ~30 days.

---

## What I need from you to start

1. **Do the workspace transfer** (Step 1). Tell me when it's done.
2. **Confirm the destination project's name** so I can locate it after transfer.
3. **Heads-up on any modules in the destination I should *not* touch** (e.g. "don't replace our existing Incidents module, only add missing fields").

Once those are in hand, I'll start Step 2 (the Migration Mapping Document) and bring it back for your approval before any code or data moves.
