## Fleet Rotation Planner — Build Plan

A production-grade, Excel-like Gantt planner that replaces the "Draak - Rotation Planner.xlsx" workflow, scales fleet-wide, and links to the existing leave calendar.

### Scope clarifications I'd like to confirm before building

1. **Leave source of truth** — the app already has `crew_leave_entries`, `crew_leave_requests`, `crew_leave_carryover`, `crew_leave_locked_months`, `leave_requests`. I will reuse `crew_leave_entries` (the calendar entries table) as the linked leave source. No new `leave_events` table. ✅ unless you say otherwise.
2. **Crew master** — reuse `profiles` + `crew_assignments` (not a new `crew_members` table). Job title/department come from `profiles`/`crew_assignments`.
3. **Vessels** — reuse `vessels`.
4. **Where it lives in nav** — under **Crew → Rotation Planner** (new top-level page), with a shortcut from the existing Leave calendar. Confirm or move it under **Itinerary** or **Fleet**.
5. **Spreadsheet import** — I'll deliver the UI + parser, but actual row mapping for "Draak - Rotation Planner.xlsx" needs the file uploaded so I can calibrate header/colour heuristics. Without the file I'll ship a generic XLSX importer with a review screen.

### Database (new tables, namespaced `frp_*`)

- `frp_planner_lanes` — vessel_id, department, position_title, lane_label, lane_order, active
- `frp_rotation_assignments` — vessel_id, crew_user_id, lane_id, start_date, end_date, label, rotation_type (enum), status (enum), colour, notes, linked_leave_entry_id, linked_travel_movement_id, linked_payroll_transfer_id, source_import_id, version (optimistic lock), created_by, updated_by
- `frp_vessel_locations` — vessel_id, start_date, end_date, location_name, location_status (confirmed/estimated/tbc), notes
- `frp_travel_movements` — crew_user_id, vessel_id, direction (arrival/departure), flight_datetime, changeover_date, accommodation, route, flight_supplier, transfer_details, travel_letter_status, process_complete, pdf_link, notes
- `frp_payroll_vessel_transfers` — crew_user_id, position_title, from_vessel_id, to_vessel_id, onboarding_transfer_date, payroll_transfer_date, travel_date, status, notes
- `frp_planner_audit_log` — entity_type, entity_id, action, old_value (jsonb), new_value (jsonb), changed_by, changed_at
- `frp_import_batches` — filename, imported_by, imported_at, status, summary (jsonb)

Enums: `frp_rotation_type` (onboard, leave, travel, standby, yard, wfh, temp_cover, training, no_crew, tbc), `frp_assignment_status` (draft, confirmed, pending_approval, conflict, complete), `frp_location_status` (confirmed, estimated, tbc), `frp_travel_direction` (arrival, departure).

RLS: scope by `company_id` via `current_user_company_id()`; edit limited to roles with `crew:edit` or `planner:edit`. GRANTs included per public-schema rules.

### Frontend

- **Path**: `/crew/rotation-planner`
- **Stack**: React + TS + Tailwind, **@tanstack/react-virtual** for row/column virtualisation, **dnd-kit** for drag/resize, **date-fns** for math, TanStack Query for data.
- **Layout**: sticky left lane columns (vessel / dept / position / crew / status), sticky top headers (month → week/day → vessel-location lane), virtualised main grid.
- **Modules** under `src/modules/rotation-planner/`:
  - `pages/RotationPlannerPage.tsx`
  - `components/` — `PlannerGrid`, `LaneColumn`, `TimelineHeader`, `LocationLane`, `RotationBlock`, `BlockDetailDrawer`, `Toolbar`, `ZoomControls`, `FilterBar`, `LegendBar`, `ConflictBadge`, `ContextMenu`, `ImportDialog`, `ImportReview`, `ExportMenu`
  - `hooks/` — `usePlannerData`, `useZoom`, `useSelection`, `useUndoRedo`, `useDragResize`, `useConflicts`, `useRealtime`
  - `lib/` — `dateMath.ts`, `conflicts.ts`, `xlsxParser.ts` (SheetJS), `xlsxExporter.ts`, `pdfExporter.ts`
  - `types.ts`, `constants.ts`
- **Zoom levels**: day / week / fortnight / month / quarter / year + custom range + Today + jump-to.
- **Interactions**: click-drag create, drag-move, edge-resize, vertical drag to switch lane, duplicate, split, delete, multi-select, copy/paste, undo/redo, keyboard shortcuts, snap-to-zoom.
- **Detail drawer**: full assignment edit + linked leave / travel / payroll-transfer records + audit history.
- **Conflict engine**: double-assignment, leave overlap (hard for approved, soft for pending), missing vessel location, missing payroll transfer at changeover, incomplete travel near changeover, gap detection. Red/amber outlines + toolbar badge + filter.
- **Performance**: visible-range query (start..end + vessel filter), windowed rendering, optimistic mutations w/ rollback, `version` optimistic-lock check on save.
- **Realtime**: Supabase channel on `frp_rotation_assignments` filtered by company_id; merge inbound, warn on conflicting local edits.
- **Export**: filtered view → XLSX (SheetJS) and PDF (jsPDF + autotable); travel-list / conflicts / locations exports.
- **Import**: upload XLSX → parse Timeline sheet (column A lanes, row 1 locations, merged colour ranges → assignments), monthly tabs (arrivals/departures → travel_movements), Crew Data (match to profiles), YCOLIVE Transfers, Test Flights → review screen with matched/unmatched/skipped → commit.

### Permissions

- Admin / DPA / Fleet Manager: full edit + import + delete + export
- Captain / Master: edit rotations + travel links on their vessel(s)
- HOD: view + comment on own department
- Crew: view own rotation + own leave only
- Read-only role: view planner

Enforced server-side via RLS using existing `has_role` / `user_has_module_access`; client gates UI affordances.

### Delivery order

1. Migration (tables, enums, RLS, GRANTs, audit-log triggers, updated_at triggers).
2. Types regen + data hooks (CRUD + visible-range query + realtime).
3. Grid skeleton (virtualised, sticky headers, zoom, location lane).
4. Block rendering + drag/resize/create/select/keyboard.
5. Detail drawer + linked records.
6. Conflict engine + filter bar + toolbar.
7. Import flow (XLSX parser + review).
8. Export (XLSX/PDF).
9. Realtime + optimistic-lock save guard.
10. Polish + empty/loading/error states + permissions gating.

### Open questions

- **Nav placement**: Crew → Rotation Planner (default), or Itinerary, or Fleet?
- **Leave table**: confirm `crew_leave_entries` is the right one to link (vs `crew_leave_requests` or `leave_requests`)?
- **Upload the .xlsx?** Needed to calibrate the import parser to your exact layout. Without it I'll ship a generic parser + manual mapper.
- **Scope cut for v1**: ship everything in one go, or land the grid + CRUD + leave-link + conflicts first, then import/export/realtime in a follow-up? (One-shot will be a very large change.)
