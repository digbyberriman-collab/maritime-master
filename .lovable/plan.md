## Goal

Add a "Fleet Dashboard" view to the existing `/dashboard` so users can toggle between:
- **Vessel** view (current Sealogical-style single-vessel dashboard)
- **Fleet** view (this new Sealogical Fleet Dashboard mock)

Same route, same layout shell, same top module nav and chip header. Only the page body switches.

## Scope (from your answers)

1. View toggle on `/dashboard` — two pill buttons "Vessel" / "Fleet" near the page title; default to Fleet when the user has multi-vessel access and "All Vessels" is selected.
2. Inner left sub-nav inside the page body (Fleet Dashboard / Fleet Tracker / Fleet Reports / Fleet Calendar / Fleet Documents / Fleet Checklists / Vessels + Administration group). Sticky on desktop, collapses to a top row on mobile. Items deep-link to existing routes where they exist; missing ones go to a `?tab=` query state and render a "Coming soon" placeholder.
3. Regional mini-map cards — Leaflet `MapContainer` with CARTO light tiles, one card per region, vessel markers from `hashToCoord` (already used in FleetMap), "Open Full Fleet Tracker" CTA → `/fleet-map`.
4. Pastel KPI tile row — 6 tiles (Document Alerts, Hours of Rest, Leave Overdue, Safety, Technical, Accounting) with soft pastel backgrounds (`bg-*-50` style via semantic tokens), big number, sub-line.
5. Vessel Health Matrix table — rows = vessels, columns = Crewing · Documents · Safety · Technical · HOR · Accounting · Insurance · Onboarding. Each cell = colored dot + count. Click row → vessel dashboard.

Out of scope: Custom region editor, real AIS, persisting view choice cross-session (sessionStorage is enough).

## Data wiring

- Vessels: `useVessels()` for the full list (already in project).
- Per-vessel counts: call `useVesselDashboard` aggregated data per vessel via the existing RPC `get_vessel_dashboard_summary` (one-shot for all vessels) and map fields:
  - Crewing → crew_onboard_count vs expected (use count alone)
  - Documents → certs_expiring_90d
  - Safety → red_alerts_count + open_capas_count
  - Technical → overdue_maintenance_count + critical_defects_count
  - HOR → 0 (no current hook; placeholder green)
  - Accounting → 0 (placeholder)
  - Insurance → 0 (placeholder)
  - Onboarding → training_gaps_count
- KPI row uses the same aggregated dataset; HOR / Leave Overdue / Accounting render as 0 with neutral green tone when no source available.
- Regions: bucket vessels by `flag_state` → static region map:
  - `IT, FR, ES, MC, GR, MT, CY, TR, HR` → "Mediterranean"
  - `US, BS, KY, BM, AG, JM` → "US East Coast / Caribbean"
  - everything else → "Worldwide"
- Map markers via the existing `hashToCoord` pattern.

## Files to add / edit

- create `src/modules/dashboard/components/FleetDashboardView.tsx` — full Fleet view (sub-nav + maps + KPIs + matrix).
- create `src/modules/dashboard/components/fleet/RegionMapCard.tsx` — single Leaflet mini-map card.
- create `src/modules/dashboard/components/fleet/FleetKPITiles.tsx` — pastel 6-up row.
- create `src/modules/dashboard/components/fleet/VesselHealthMatrix.tsx` — vessel × module table.
- create `src/modules/dashboard/components/fleet/FleetSubNav.tsx` — inner left sidebar with the 7 items + Administration group.
- edit `src/modules/vessels/pages/VesselDashboard.tsx` — add a `view` state (`'vessel' | 'fleet'`), toggle pill, render `FleetDashboardView` when fleet.
- edit `src/shared/hooks/` (none — view state stays local + sessionStorage).

## Technical notes

- Reuse `useVesselDashboard` hook with a fleet-wide list — make a thin `useFleetVesselSummaries()` helper colocated in `FleetDashboardView.tsx` that calls the RPC with `p_vessel_ids = null, p_aggregate_all = false`.
- Tokens only — pastel tiles built from `bg-amber-50 text-amber-700` etc. (these are Tailwind utility classes that already work in this project; they are not the forbidden hex hardcodes).
- Status dot helper: `count === 0 → bg-emerald-500`, `1-3 → bg-amber-500`, `>=4 → bg-rose-500`, no data → `bg-muted-foreground/40`.
- Leaflet maps use `scrollWheelZoom={false}`, `zoomControl`, fixed `h-64`. CARTO `light_all` tile URL.
- Toggle defaults: `canAccessAllVessels && isAllVessels` → fleet view; else → vessel view.

## Out of scope (explicit)

- No DB / RLS / migrations.
- No route changes.
- No sidebar (left STORM nav) changes.
- No edits to the existing FleetMap page.
