# New Build Module — Integration Plan

The uploaded `Yacht Build Management` zip is a complete standalone Lovable app: 28 pages, ~50 components, 4 edge functions, 30+ migrations, and ~25 DB tables. We will fold it into STORM's existing `Yard → New Build` sitemap section without disrupting anything else.

## Goals

1. New Build becomes a fully functional sub-app under `/yard/new-build/*`.
2. Reuses STORM's auth, layout, sidebar, design tokens — does **not** ship a second sidebar/login.
3. Tables are namespaced so they cannot collide with existing STORM tables.
4. Existing STORM routes/pages are untouched.

## Scope mapping (source → STORM)

Source pages map to existing sitemap leaves:

```text
Overview/Dashboard           → /yard/new-build/overview/dashboard
Phases                       → /yard/new-build/overview/build-phases
Requirements                 → /yard/new-build/overview/requirements
Onboarding                   → /yard/new-build/overview/onboarding
ChangeOrders                 → /yard/new-build/workflow/change-orders
Decisions (RAID)             → /yard/new-build/workflow/raid-log
Approvals                    → /yard/new-build/workflow/approvals
Timeline (Gantt)             → /yard/new-build/workflow/schedule
Areas                        → /yard/new-build/disciplines/areas
Interior                     → /yard/new-build/disciplines/interior
NavalArchitecture            → /yard/new-build/disciplines/naval-architecture
Piping                       → /yard/new-build/disciplines/piping
DeckPlan                     → /yard/new-build/disciplines/deck-plan
Equipment                    → /yard/new-build/equipment/equipment
PurchaseOrders               → /yard/new-build/equipment/purchase-orders
Files                        → /yard/new-build/documents/files
(Drawings via files filter)  → /yard/new-build/documents/drawings
YardStandards                → /yard/new-build/documents/yard-standards
Regulations                  → /yard/new-build/documents/regulations
Locations                    → /yard/new-build/configuration/locations
Rasci                        → /yard/new-build/configuration/rasci
Suppliers                    → /yard/new-build/configuration/suppliers
Contacts                     → /yard/new-build/configuration/contacts
Import                       → /yard/new-build/configuration/import
```

Dropped: source `Login/Signup/Forgot/Reset/Index/NotFound/AppLayout/AppSidebar/AuthGuard` — STORM already provides these.

## Phased implementation

### Phase A — Foundation (this turn)
- Add module folder `src/modules/new-build/{pages,components,hooks,lib}`.
- Copy source pages/components verbatim, strip out their `<AppLayout>` wrapper and any `useAuth/AuthGuard` calls (STORM's `ProtectedRoute` + `DashboardLayout` already wrap them via `routes/index.tsx`).
- Rewrite imports: `@/contexts/ProjectContext` → local module context; `@/integrations/supabase/client` → STORM's existing client; `@/components/ui/*` → existing shadcn (already identical).
- Wire all 24 leaf paths in `src/routes/index.tsx`, replacing the auto-generated PlaceholderWrapper for each.
- Sitemap stays as-is; only `existing` props are added to the matching leaves so they point to the new pages.

### Phase B — Database
- Squash the 30 source migrations into **one** STORM migration that creates tables under a `nb_` prefix (`nb_projects`, `nb_areas`, `nb_decisions`, `nb_files`, `nb_approvals`, `nb_suppliers`, `nb_build_phases`, `nb_milestones`, `nb_materials`, `nb_material_usages`, `nb_equipment`, `nb_purchase_orders`, `nb_change_orders`, `nb_requirements`, `nb_schedule_tasks`, `nb_regulations`, `nb_yard_standards`, `nb_drawings`, `nb_deck_views`, `nb_deck_rooms`, `nb_element_codes`, `nb_rasci_roles`, `nb_rasci_assignments`, `nb_vendor_contacts`, `nb_timeline_imports`). Avoids collisions with STORM's existing `suppliers`, `equipment`, `files`, etc.
- Each table: `GRANT` to `authenticated` + `service_role`, `ENABLE RLS`, policies scoped to STORM's existing `company_id` + `has_role('DPA'|'Master'|'Shore')` for write, authenticated read.
- Storage bucket `nb-files` (private) + `nb-material-swatches` (public).
- Module page queries are updated to use the `nb_` table names.

### Phase C — Edge functions
Port `detect-rooms`, `extract-yard-metadata`, `index-regulation`, `index-yard-standard` to `supabase/functions/nb-*`. Use Lovable AI Gateway (no new keys needed).

### Phase D — Polish
- Project picker (Y727/Y728 etc.) lives in the New Build header, not the global STORM header.
- Apply STORM design tokens (Storm blue `--brand-primary`), drop the source's `#2563EB` overrides.
- Smoke test all 24 routes; verify build.

## Out of scope

- No edits to STORM's existing tables, auth, RBAC, or sidebar component.
- No data migration from the source app — tables start empty.
- Source's separate login/signup/reset/forgot pages are not ported.
- Cross-module data sharing (e.g., linking a New Build vessel to a STORM vessel record) is deferred.

## Verification

After each phase: `bun run build`, then spot-check 3 routes in preview (one Overview, one Discipline, one Configuration page) for render + DB query success.

## What I need from you to start

1. **Confirm phase A scope** (pages + routing only, no DB yet) is the right starting point, or tell me to do A + B in one go.
2. **Project model**: should New Build "projects" (Y727, Y728) be standalone records, or tied to STORM `vessels` rows where `status = 'New Build'`? Defaults to standalone unless you say otherwise.
3. **Access**: who can use New Build — same DPA/Master/Shore RBAC as the rest of STORM, or open to all authenticated users like the source app?
