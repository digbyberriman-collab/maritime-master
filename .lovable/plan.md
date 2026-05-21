# STORM → Destination App: Staged Migration Plan

## Ground rules (locked in from your answers)

- **Bridge**: manual hand-off. I produce a packet per stage (SQL migration + module folder + paste instructions); you apply it in the destination project.
- **Scope**: all ~23 STORM modules eventually move.
- **Integration shape**: namespaced under **Vessel Management** in the destination's sidebar. Vessel Management becomes a collapsible parent group; every STORM module is a sub-item under it (same pattern as the current STORM sidebar's expandable groups). Routes mirror the nesting (e.g. `/vessels/crew`, `/vessels/certificates`, `/vessels/ism/forms`, etc.).
- **Data**: schema only. No row migration. Destination starts empty for STORM tables.
- **Auth & RBAC**: destination's existing auth wins. STORM's `user_roles` / `rbac_user_roles` / `roles` / `role_permissions` tables do **not** move. Instead, each stage ships a thin **role adapter** that maps destination roles → the STORM role names the ported code expects, so RLS and UI gates keep working without rewriting every check.
- **Order**: dependency order (foundation first, leaves last).

## Stage 0 — One-time foundation (before any module moves)

The destination needs this before stage 1, or nothing else compiles.

**0a. Sidebar shell**
- Add a `Vessels` collapsible group to the destination's sidebar with a chevron sub-menu (Shadcn `SidebarGroup` + `Collapsible`, matching STORM's pattern). Empty for now — modules slot in over time.

**0b. Role adapter**
- Add `src/integrations/storm/roleAdapter.ts` in the destination. Single function: `toStormRole(destRole) → 'dpa' | 'captain' | 'crew' | …`. You and I fill the mapping table together once we know the destination's role names.
- Add `useStormRoles()` hook that wraps the destination's auth and returns STORM-shaped roles. Ported STORM hooks import from this instead of from `@/modules/auth`.

**0c. Foundation tables**
- Port `companies`, `profiles`, `vessels` schemas only if the destination doesn't already have equivalents. If it does, write a mapping note (`destination_table.column ↔ storm_table.column`) — we'll alias in code, not in SQL.
- Port the shared security-definer helpers that almost everything depends on: `has_role`, `has_any_role`, `get_user_company_id`, `current_user_company_id`, `user_belongs_to_company`. These read from destination tables via the adapter — I rewrite their bodies during port.

**0d. Shared frontend**
- Copy `src/shared/components/layout/*` pieces the modules need (AdaptiveActionBar, GlobalHeaderControls, VesselToggleBar, NotificationBell), `src/modules/vessels/contexts/VesselContext.tsx`, design tokens from `src/index.css` (Storm blue, semantic HSL), and the `src/lib/pdf/*` helpers.
- Reconcile against destination's existing `components/ui/*` — adopt destination's versions where they exist.

Stage 0 is the only stage where you may need to touch destination chrome. Every later stage is additive.

## Stage sequence (dependency order)

Each stage = one packet from me containing: SQL migration file(s), module folder, sidebar entry snippet, route registration snippet, and a short README of gotchas.

```text
Stage  Module(s)                              Depends on
-----  -------------------------------------  -----------------
1      Vessels (entity + dashboard)           0
2      Crew roster + assignments              1
3      Certificates (vessel + crew + alerts)  2
4      Alerts engine + Red Room               1
5      Documents                              1
6      ISM Forms (templates + submissions)    5
7      Incidents + CAPA                       4
8      Drills                                 2, 4
9      Audits + Management Reviews            7
10     Risk Assessments + Work Permits        1
11     Training & Familiarization             2, 3
12     Planned Maintenance + Defects          1, 4
13     Hours of Rest                          2
14     Itinerary + Trip Suggestions           1
15     Flights / Travel                       2
16     Crew Development                       2
17     HR                                     2
18     Insurance                              1
19     Emergency Contacts                     1
20     Compliance hub (ISM/ISPS/MLC index)    6–13
21     Analytics dashboards                   most of the above
22     Settings (alerts, branding, fleet groups)  all
23     Audit logs                              all
```

The order means: if you stop after stage N, the destination is still buildable and the migrated modules still work.

## What each stage packet contains

1. **`supabase/migrations/<timestamp>_storm_<module>.sql`** — `CREATE TABLE`s, RLS policies (rewritten to call destination-side helpers), security-definer functions, triggers, storage buckets + policies if needed. No data inserts.
2. **`src/modules/<name>/`** — the module folder lifted from STORM, with imports rewritten to:
   - `@/integrations/storm/roleAdapter` instead of `@/modules/auth/hooks/useUserRoles`
   - destination's paths for `components/ui/*` and `lib/utils`
3. **Sidebar snippet** — the `<SidebarMenuItem>` to drop into the `Vessels` group.
4. **Route snippet** — the lazy-loaded route lines for the destination's router.
5. **Edge functions** (when the module has them) — drop into `supabase/functions/<name>/`, auto-deploys.
6. **Secrets checklist** — names of any secrets the module needs (e.g. Airtable for Crew, Lovable AI for forms extraction). You add them in destination's Cloud settings.
7. **Verification checklist** — 3–5 things to click in the destination after applying, to confirm the module is alive.

## Things that need explicit decisions per stage (I'll flag them in the packet)

- **Table-name collisions** with destination's existing tables. Default: keep STORM's name, prefix with `storm_` only if there's a hard conflict.
- **Role mapping gaps** — if a STORM module checks for a role the destination doesn't have (e.g. `dpa`, `purser`), we either add it to the adapter as an alias of an existing destination role, or gate the feature off.
- **Shared dependencies already present** in destination (e.g. their own VesselContext) — we adopt destination's version and rewrite STORM module imports.

## What I need from you to start Stage 0

1. **Destination project's auth model**: paste the role names it uses (or a screenshot of its user/roles table), so I can build the role-adapter mapping.
2. **Destination's sidebar file path** (or its current sidebar component), so my Stage 0 packet patches the right file.
3. **Confirmation that destination uses Lovable Cloud** (Supabase under the hood) so my SQL migrations will apply cleanly.

Once those three land, I'll produce the Stage 0 packet. After you apply it and confirm the destination still builds, we move to Stage 1 (Vessels) and keep going one stage at a time.

## Technical notes

- All RLS policies on ported tables will be rewritten to use `current_user_company_id()` (destination-resolved) instead of STORM's `user_roles` lookup. This is the key trick that lets us drop STORM's RBAC tables without touching every policy.
- Edge functions that call `supabase.auth.getUser()` work unchanged — they read destination's JWT.
- The `Powered by Inkfish` watermark + STORM brand tokens are scoped to the `/vessels/*` route subtree only, so the rest of the destination app keeps its own branding.
- Storage buckets are recreated empty in destination; no object copy.
- The `airtable-sync` edge function (Crew) needs the `Airtable` secret re-added in destination — flagged in Stage 2.
