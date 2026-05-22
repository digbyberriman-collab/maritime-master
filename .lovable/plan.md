## Goal

Make `/dashboard` (VesselDashboard) look like the Sealogical reference. Keep the existing sidebar and all data sources — only the header strip, a new horizontal module nav, and a bottom Recent Activity table change visually.

## Scope (from your answers)

1. Header layout — logo left, pill-style chips on the right (vessel name, "Intel", multi-vessel, alerts bell, fleet, role, user email).
2. Horizontal module nav under the header (Crew, Safety, Certificates, Technical, Charter, Accounting, Vessel, Reports) with subtle icons.
3. Recent Activity table at the bottom (Module · Notification · Time), wired to existing data.
4. Replace current `/dashboard` route (VesselDashboard).
5. Wire to existing dashboard data (`useVesselDashboard`, `useRecentIncidents`, activity feed hook).

Out of scope: gradient module tiles, sidebar changes, any backend/data model changes.

## Changes

### 1. Header strip — `src/shared/components/layout/DashboardLayout.tsx`
Restyle the existing `<header>` so the right side renders chip-style buttons (rounded `rounded-full border bg-card px-3 h-8 text-sm`) for:
- Selected vessel name (from `useVessel().selectedVessel`)
- "Intel" search chip (opens existing global search if present, else no-op placeholder)
- Multi-vessel filter (reuse `GlobalHeaderControls` but render its children as chips)
- Notification bell (already a chip-friendly icon)
- Fleet chip (opens fleet filter / nav to `/fleet-map`)
- Role badge ("Superadmin"/role label)
- User email chip (opens the existing user dropdown)

No new state, no new context. Pure visual refactor of the header right cluster.

### 2. Horizontal module nav — new component `src/shared/components/layout/TopModuleNav.tsx`
Thin row below the header, scrollable on small screens. Items map onto existing routes:
- Crew → `/crew/roster`
- Safety → `/ism`
- Certificates → `/certificates`
- Technical → `/maintenance`
- Charter → `/itinerary`
- Accounting → `/hr` (closest existing module; placeholder until an accounting module exists)
- Vessel → `/vessels/dashboard`
- Reports → `/analytics` (or `/ism/incidents` if no analytics route)

Render only inside `VesselDashboard` (not globally) so other pages keep the existing AdaptiveActionBar.

### 3. Recent Activity table — new component `src/modules/dashboard/components/RecentActivityTable.tsx`
Columns: Module · Notification · Time. Uses the existing `RecentActivityFeed` hook/data and renders it as a table instead of a feed. Falls back to recent incidents if the activity feed is empty.

### 4. `VesselDashboard.tsx` reorganisation
- Add `<TopModuleNav />` directly under the page title row.
- Keep KPI widgets and existing panels untouched (per "only header / nav / activity" scope).
- Replace the current `RecentActivityFeed` card at the bottom with `<RecentActivityTable />`.

## Technical notes

- All colors via semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`, `--brand-primary`). No hex values in components.
- Chips: shared `<Button variant="outline" size="sm" className="rounded-full h-8 gap-2" />`.
- TopModuleNav uses `NavLink` from `react-router-dom` with `isActive` styling (`text-primary border-b-2 border-primary`).
- No navigation.ts edits — top nav is a presentational shortcut row, not a structural sidebar change.
- No DB / RLS / auth changes.

## Files touched

- edit `src/shared/components/layout/DashboardLayout.tsx`
- create `src/shared/components/layout/TopModuleNav.tsx`
- create `src/modules/dashboard/components/RecentActivityTable.tsx`
- edit `src/modules/vessels/pages/VesselDashboard.tsx`
