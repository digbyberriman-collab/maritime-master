## Goal

Make the sidebar mirror the Inkfleet sitemap exactly (6 top-level sections, hundreds of leaf items, nested up to 4 deep) and ensure every entry resolves to a working route — existing pages stay, missing ones render a "Coming Soon" placeholder so nothing 404s.

## Top-level sections to build (from the sitemap)

1. **Fleet** — 13 items (Dashboard, Scheduler, Tracker, Reports, Calendar, Rotation Planner, Documents, Checklists, Vessels, Users & Access, Notification Management, Support Tickets, Account)
2. **Vessel** — 8 grouped modules: Crew (10), Safety (18, incl. Standing Orders & SOPs sub-groups), Certificates (12), Technical (8), Charter (3), Accounting (7), Vessel (9), Departments (Crew Departments × ~10 with 6-tab sub-pattern + Galley/Dive specials; Management/Office × 8 incl. HR sub-group)
3. **Shoreside** — 8 items (Embrace, Lungfish, Bonefish, InkWELL, MedINK, Crew Concierge, Cosmic Frontier Labs, Dark Ocean)
4. **Health & Wellness** — Medical (10 + Personnel Medical Data sub-group of 8), Spa (5), Nutrition (5), Physio (5), Personal Training (Trainer mode + Athlete mode, ~20 leaves)
5. **Yard** — Refit (8 groups, ~40 leaves), New Build (6 groups, ~24 leaves)
6. **HRIS** — 9 items incl. Employee Records (5), Compensation (4), Performance (4), Recruitment (4), plus 4 leaves

Total ≈ 260 unique leaf paths.

## Approach

### 1. Navigation config (`src/config/navigation.ts`)

Replace `NAVIGATION_ITEMS` with a section-grouped structure. Introduce an optional `section` field on `NavItem` (`'fleet' | 'vessel' | 'shoreside' | 'health' | 'yard' | 'hris'`) so `SidebarNavigation` can render section headers between groups. Reuse existing paths where the live page already exists; otherwise generate a stable path under the section root, e.g. `/fleet/scheduler`, `/vessel/safety/permit-to-work`, `/yard/refit/workflow/change-orders`.

All entries `permissions: ['all']` for now — your superadmin role already bypasses. We can tighten later.

### 2. Route registration (`src/routes/index.tsx`)

Add a generated catch-all block of placeholder routes from a single source-of-truth array (the same one navigation imports). Keep all current explicit routes untouched. For each leaf in the sitemap that doesn't already match an explicit route, register:

```tsx
<Route path={path} element={<ProtectedRoute><PlaceholderWrapper title={label} /></ProtectedRoute>} />
```

This way new pages built later can simply replace the placeholder by adding an earlier explicit route.

### 3. Placeholder source of truth

New file `src/config/sitemap.ts` exports `SITEMAP_LEAVES: { path, label, section }[]` derived from the sitemap above. `navigation.ts` and `routes/index.tsx` both consume it — no drift.

### 4. Sidebar rendering (`src/shared/components/layout/SidebarNavigation.tsx`)

Minor patch: render a small uppercase section header (`FLEET`, `VESSEL`, …) before the first item of each section. No other layout changes; existing collapsible/active-state logic continues to work for arbitrarily deep `children`.

### 5. Cross-links (e.g. Spa → Health & Wellness › Spa)

The sitemap marks several items as cross-links (Spa, Medical under Crew Departments, Nutrition ↔ Galley, Fleet Rotation Planner ⇄ Vessel Rotation Planner). I'll model these as plain nav children that point at the canonical path (no duplicate route), with an `aria-label` noting the cross-link.

## Out of scope (call out)

- No new business logic, no DB changes, no permission edits.
- No restyle of placeholder pages beyond the existing `PlaceholderPage` component.
- Existing routes/pages keep their current paths even if the sitemap implies a slightly different label; only the label/grouping changes in the sidebar.

## Verification

- Build passes (harness runs it automatically).
- Spot-check 3 routes in the preview: one Fleet leaf, one deep Vessel › Departments › Galley leaf, one Yard › Refit leaf — all render either the real page or the placeholder, no 404.

Confirm and I'll execute.