# Vessel view: Charter, Vessel (voyages, tracking, vessel record), Calendar and Reports — gap analysis

> Spec for implementers. It compares the rebuild blueprint (v1.3) of the reference app with STORM as the code stands today, and states what STORM must build for four vessel-view modules: **Charter** (charters / trips, planner, guest list, charter checklists), **Vessel** (voyage plans with departure → noon → arrival movement reports, passage plans and voyage checklists, AIS tracking, vessel record and administration pages), **Calendar** and **Reports** (the 18 vessel reports, including the Compliance Pack and Emissions & Fuel). Requirements are written as STORM requirements in our own words. Blueprint sections are cited as `§n.n`; support-ticket themes as `#n` (ticket number only).
>
> Depends on: `01-foundations-tenancy-roles.md` (vessel routes `/v/:vesselCode/…`, `vessels.code` (F9), `has_capability`, `vessel_module_settings` incl. the Charter/Trip label, `is_company_actor()`, `vessel_office_holders()` (F33), `format_reference()`), `02-fleet-view-operations.md` (`calendar_events`, `fleet_calendar_feed`, `vessel_latest_position`, `ais_snapshots` columns, fleet reports hub and its Movements / Emissions pages, Forms & Checklists builder with `movement` and `charter` areas), `04-vessel-crew.md` (crew list, onboard status, `crew_movements`, FAL 5 crew list, biographies, occasional workers), `05-vessel-safety-sms.md` (signature slot conventions, safety records feeding reports) and `06-vessel-certificates-technical.md` (`vessel_insurance_policies`, `certificate_register_v`, technical equipment, logbook links). The **signature engine** itself (signature store, Verified / Witnessed / on-behalf methods, PDF stamping) is owned by the signatures doc; this doc defines the slots and what each one triggers.

---

## Scope

### Blueprint sections covered

| § | Topic | Notes |
|---|---|---|
| §5.5 (5.5.1–5.5.6), §3.19, §6.16, image13 | Charter: list, new / edit form, detail, planner, guest list + Add Guest, charter checklists; Charter and Guest entities; charter state machine | Damage claim form and APA were not captured (§10.2); STORM designs its own |
| §5.6.1, §3.15, §6.10, image45, image5, image6, image7 | Voyage Plans list, Departure / Noon / Arrival reports, Master's signature, voyage and report state machines, sign-off sequence | |
| §5.6.2 | Voyage Checklists (passage plan template run per voyage) | Checklist builder itself is doc 02 |
| §5.6.3, §3.3, §3.35, §8.7 | Vessel record and administration pages (Vessel Details, Communications, Emergency Contact, Documents, Management Company, Owner & Employer, Flag & Class, Insurance, Billing, Settings); Logo / Icon / Seal | Add New Vessel dialog and Vessels admin are doc 03; module toggles are doc 01 |
| §5.6.4, §7.8 | Tracking page, AIS-derived voyage history and port calls | Fleet Tracker page is doc 02 (T1–T4) |
| §5.7, §3.22, §7.2 | Vessel calendar: views, categories, Add Event | Fleet calendar and the shared feed are doc 02 (C1–C6, W7) |
| §5.8, §7.3, §7.4 | Vessel reports index and all 18 report layouts, Compliance Pack, exports | Data contracts for crew, safety and certificate reports come from docs 04 / 05 / 06; this doc owns the reports hub, page shell, Movement, Emissions, PTW log, Overdue actions, Annual incident summary and the Compliance Pack |
| §8.2, §8.8, §8.9 (Vessel), §8.10 (voyage rows) | On-behalf signing of voyage reports; voyage PDFs; Vessel notification types; voyage delete rules | |
| §1.6 | Voyage identifier format | |

### Support tickets

All 142 tickets were scanned; about 25 bear on this domain:
- **Voyages and passage plans:** #19 (several draft plans in parallel, show upcoming not only active, copy a previous plan), #41 (plan status control, alternatives, multiple "read and agreed" acknowledgements tied to the plan version, re-acknowledge after revision), #11 (save a passage plan as draft), #49 (up to 20 reporting points), #50 (five signatures on the passage plan), #28 (a vessel's eleven voyage checklists), #3 (account-specific passage plan replacing the standard checklist).
- **Movement reports and fuel:** #324 (noon report should match the vessel's engine set-up — port and starboard mains, three auxiliaries, bow thruster — and accept whole-vessel consumption where engines have no individual meters), #23 (remove fuel grades the fleet does not burn; remove boiler fuel), #327 (record the grade of fuel bunkered), #24 (bunker request form routed ashore), #232 (Emissions & Fuel report, awaiting approval).
- **Guests and people on board:** #39 (fleet-wide guest / occasional-worker directory; a person onboard only one vessel at a time), #32 (occasional workers on the onboard list but outside crew compliance), #306 (forecast crew list).
- **Planner and calendar:** #20, #27, #71, #228, #316 (vessel movements lane in the planner; an external sheet sync that broke when the sheet format changed), #10 (leave removed from the calendar — calendar sources must be switchable).
- **Reports:** #248 (more status filters on a report), #69 (annual incident summary exportable by vessel and across the fleet), #292 (hours of rest report), #290 (HESS report design), #79 (acknowledgement CSV export).

### STORM paths inspected (code read, not names)

- Navigation and routes: `src/config/sitemap.ts` (fleet lines 82–97; vessel Charter 182–188; Vessel 218–230; placeholder generator 634–674), `src/shared/components/layout/SidebarNavigation.tsx` (quick links 29–33), `src/routes/index.tsx` (fleet map 180, vessels 199–219, `/crew/calendar` 267, itinerary 576–603, `/reports/*` 721–748, placeholders 826–840).
- Itinerary (closest thing to charter planning): `src/modules/itinerary/{types.ts,constants.ts,hooks/useItinerary.ts,hooks/useTripSuggestions.ts,pages/FleetPlanningPage.tsx,pages/FleetTimelinePage.tsx,pages/PostponedEntriesPage.tsx,pages/TripSuggestionsPage.tsx,components/*}`; migration `supabase/migrations/20260214140830_*.sql` (`trip_types`, `ports`, `itinerary_entries`, `itinerary_entry_vessels`, RLS).
- Vessels: `src/modules/vessels/{pages/Vessels.tsx,pages/VesselDashboard.tsx,pages/IndividualVesselDashboard.tsx,pages/CompanyDetails.tsx,pages/VesselEmergencyDetailsPage.tsx,components/VesselFormModal.tsx,components/VesselProfileCard.tsx,components/VesselParticularsModal.tsx,config/particularsSchema.ts,hooks/useVessels.ts,hooks/useVesselDashboard.ts}`; `src/modules/emergency/store/emergencyContactsStore.ts`; migration `20260127170858_*.sql` (vessel columns, `ais_snapshots`, `fleet_groups`).
- Tracking: `src/modules/dashboard/pages/FleetMap.tsx`, `src/modules/dashboard/components/fleet/{RegionMapCard.tsx,regionUtils.ts}`; edge functions `supabase/functions/{ais-refresh,ai-route-planner,geocode-search}/index.ts`; `supabase/config.toml` (lines 45–77).
- Logbooks (deck-log noon section and telemetry): `src/modules/logbooks/lib/{catalog.ts,templates.ts,telemetry.ts,logbookApi.ts}`, `docs/LOGBOOKS.md`.
- Calendar: `src/modules/crew/pages/VesselCalendar.tsx`.
- Reports and analytics: `src/modules/incidents/pages/{IncidentAnalytics.tsx,CAPATracker.tsx}`, `src/modules/drills/pages/DrillAnalytics.tsx`, `src/modules/analytics/hooks/*`, `src/modules/work-rest/reports/exports.ts`, `src/modules/crew/lib/crewListPdf.ts`, `src/modules/crew/components/OfficialCrewListDialog.tsx`, `src/lib/pdf/pdfTemplate.ts`, `src/lib/documentExport.ts`, `src/shared/hooks/usePDFExport.ts`.
- Guests / people: `src/modules/health/hooks/useHealthPeople.ts` (`hw_people`), `supabase/migrations/20260919100000_health_phase1_foundation.sql`.
- Forms engine (voyage / charter checklists): `src/modules/ism/constants.ts` (`PRE_DEPARTURE_CHECKLIST`), `form_templates` / `form_submissions` types.
- Alerts and notifications: `src/modules/alerts/{constants.ts,hooks/useAlerts.ts}`; notification type seed `supabase/migrations/20260522163528_*.sql` (lines 80–100).
- Permissions: `docs/permissions/catalogues/storm.json` (vessel › `charter`, `general`), `scripts/permissions/build-matrix-workbooks.mjs` (action bundles), `src/modules/users-access/lib/{moduleGroups.ts,presets.ts}`.
- Generated types (grepped): `ais_snapshots`, `ports`, `vessels`, `itinerary_entries`, `trip_types`, `frp_vessel_locations`, `hw_people`, `insurance_policies`, `vessel_emergency_contacts`, `form_templates`, `form_submissions`.

### What we found (summary)

1. **No voyage data model.** There is no voyage, movement-report, passage-plan or port-call table. `Movement Reports` and `Movement Checklists` in the Vessel nav (`sitemap.ts` lines 221–222) render the generated Coming Soon page. The only structured noon data in STORM is the **Deck log "Noon report" section** in the electronic logbooks (`logbooks/lib/templates.ts` line 136: position, distance, SOG, weather, fuel and water ROB, destination/ETA) — signed and immutable, but not a voyage workflow.
2. **Charter is placeholders only.** `Charters`, `Guest List` and `Checklists` (`sitemap.ts` 184–188) are Coming Soon. The **itinerary module** is real (fleet trip Gantt on `itinerary_entries`, statuses draft / tentative / confirmed / postponed / cancelled / completed, trip types, multi-vessel groups, lock, AI route planner, crew trip suggestions, heat map) but has no commercial, guest, crew, document or checklist data. Past entries are marked Completed **only in the browser** (`applyAutoCompletion`, `useItinerary.ts` 55–65), so the database and any report disagree with the screen.
3. **Guests exist only in Health.** `hw_people` (`person_type = 'guest' | 'owner' | …`) holds name, DOB, gender, nationality, contacts, cabin, emergency contact, arrived / departed dates. No identity document, ports, status lifecycle, induction or charter link.
4. **Tracking is simulated end to end.** `FleetMap.tsx` places vessels with `hashToCoord()` and a random status; `RegionMapCard.tsx` does the same via `regionUtils.vesselCoord()`. `ais-refresh` selects `vessels.mmsi_number`, a column that does not exist (the column is `mmsi`), so every call fails; if that were fixed, the default `mock` provider would write **random positions into `ais_snapshots`**. Nothing in the frontend reads `ais_snapshots`. The function authorises on legacy `profiles.role in ('dpa','shore_management')` and keeps an in-memory cache that does not survive cold starts.
5. **Vessel record is partly real.** `VesselProfileCard` + `VesselParticularsModal` edit typed `vessels` columns plus a free-text `particulars` JSON (which duplicates MMSI as `particulars.mmsi_number`). Emergency contacts are real with revision history (`vessel_emergency_contacts`, RPC `get_vessel_emergency_contacts`) but lack the repeating office emergency team and the PDF. **Management Company is a mock** (`CompanyDetails.tsx`: `mockCompanyInfo` line 123, save is `console.log` line 152). Communications, Flag & Class, Insurance and Billing are Coming Soon. No logo / icon / seal. `insurance_policies` exists but nothing reads it. `vessels.code` does not exist (doc 01 F9).
6. **Calendar is a crew page, not the vessel calendar.** `VesselCalendar.tsx` (`/crew/calendar`) has Month and List views over `crew_travel_records`, `audits` and `drills` only. No Week view, no Add Event (the `Plus` icon is imported and never rendered), no certificate / insurance / maintenance / charter / voyage sources, no custom events table, no status tags. It is not in the vessel nav; the sidebar quick links call it "Fleet Calendar" while the sitemap's "Fleet Calendar" opens the itinerary Gantt — two different pages under one name.
7. **No vessel reports hub.** `/reports` renders Incident Analytics; `/reports/capa-tracker` and `/reports/drill-analytics` exist. Their export buttons either toast "coming soon" (`IncidentAnalytics.tsx` 107, `CAPATracker.tsx` 77) or have no handler (`DrillAnalytics.tsx` 223, 470). Working exporters exist in places: FAL 5 crew list (`crewListPdf.ts`), hours of rest (`work-rest/reports/exports.ts`), document register (`documentExport.ts`).
8. **Permission gaps.** `storm.json` has `vessel.charter.{charters, guest_list, charter_checklists}` and `vessel.general.{movement_reports, movement_checklists, vessel_details, communications, emergency_contact, management_company, flag_class, vessel_insurance, billing}`, but `movement_reports` uses the `record` bundle (no `sign`), and there is no vessel **calendar**, vessel **reports** or **tracking** subcategory. In the live Users & Access UI the "Charter" group maps to module keys `meetings` and `reports` (`moduleGroups.ts` line 18) and the Charter chip reads the `fleet` key (`presets.ts` line 44): granting "Charter" today grants something else.
9. **Open edge functions.** `ai-route-planner` (calls a paid AI gateway) and `geocode-search` (proxies Nominatim) run with `verify_jwt = false` and no auth check of their own.
10. **Ports table is unsafe and unused.** RLS lets any authenticated user of any tenant insert or update any port (`ports_insert` / `ports_update`), there is no UN/LOCODE column, and no frontend code reads it.
11. **Crew can read other vessels' itinerary.** `itinerary_entries_select` lets any crew member read tentative / confirmed / completed entries company-wide ("vessel filtering done in app"). Acceptable for a trip board; not acceptable once charters carry client and financial data.
12. **Notification types:** `charter_starting_soon`, `charter_ending_soon` and `vessel_position_alert` are seeded but nothing sends them; there are no departure / noon / arrival report or voyage-checklist approval types (§8.9 Vessel row).

---

## Target information architecture

Principles:
- **Vessel view owns the work.** Every charter, guest stay, voyage, report, passage plan, checklist run and custom event belongs to one vessel (`vessel_id NOT NULL`). Fleet pages are roll-ups (doc 02).
- **Routes follow doc 01**: `/v/:vesselCode/…`, stable English slugs, tabs and filters in query params, records addressed by their human reference where one exists (voyage ref, charter ref).
- **The Charter module can be renamed "Trip" and switched off per vessel** (`vessel_module_settings('charter')`, doc 01). The label changes everywhere: nav, page titles, calendar category, report names. Private yachts that never charter get "Trips" with the financial block hidden by default.
- Nav labels below are STORM's; the structure mirrors the reference so crews moving across find things where they expect them.

### Vessel view

```
Charter  (label "Charter" or "Trip"; module can be off)
├─ Charters ................ /v/:vc/charter?status=all|draft|option|live|on_hold|cancelled|completed&past=0|1&view=list|grid&q=
│   ├─ New charter ......... /v/:vc/charter/new
│   ├─ Charter ............. /v/:vc/charter/:charterRef            e.g. /v/dra/charter/DRA-CH-2026-004
│   │                         anchors: #basic #logistics #financial #notes #movements #checklists #damage #guests #crew #documents
│   └─ Edit ................ /v/:vc/charter/:charterRef/edit
├─ Planner ................. /v/:vc/charter/planner?zoom=year|month&y=2026&m=11&show=movements,charters,trips
├─ Guest List .............. /v/:vc/charter/guests?status=expected|onboard|departed&charter=:charterRef&q=
│   ├─ Add guest ........... /v/:vc/charter/guests/new?charter=:charterRef
│   └─ Guest stay .......... /v/:vc/charter/guests/:stayId
└─ Checklists .............. /v/:vc/charter/checklists?tab=checklists|templates|history
                              /v/:vc/charter/checklists/runs/:runId

Vessel
├─ OPERATIONS
│  ├─ Voyage Plans ......... /v/:vc/vessel/voyages?tab=upcoming|active|past&y=2026&m=all
│  │   ├─ New departure .... /v/:vc/vessel/voyages/new[?copyFrom=:voyageRef]
│  │   ├─ Voyage ........... /v/:vc/vessel/voyages/:voyageRef      e.g. DRA-20261103-037 (reports, plan, checklists, track, charter)
│  │   ├─ Report ........... /v/:vc/vessel/voyages/:voyageRef/:kind/:reportId   kind = departure|noon|arrival
│  │   └─ Passage plan ..... /v/:vc/vessel/voyages/:voyageRef/plan[?version=n]
│  ├─ Tracking ............. /v/:vc/vessel/tracking?tab=history|port-calls
│  └─ Voyage Checklists .... /v/:vc/vessel/voyage-checklists?tab=checklists|templates|history
├─ VESSEL RECORD
│  ├─ Vessel Details ....... /v/:vc/vessel/details
│  ├─ Communications ....... /v/:vc/vessel/communications
│  ├─ Emergency Contact .... /v/:vc/vessel/emergency
│  └─ Documents ............ /v/:vc/vessel/documents  (+ ?settings=1 drawer for document types)
└─ ADMINISTRATION
   ├─ Management Company ... /v/:vc/vessel/management
   ├─ Owner & Employer ..... /v/:vc/vessel/owner-employer
   ├─ Flag & Class ......... /v/:vc/vessel/flag-class
   ├─ Insurance ............ /v/:vc/vessel/insurance
   ├─ Billing .............. /v/:vc/vessel/billing
   └─ Settings ............. /v/:vc/vessel/settings  → renders doc 03 Vessel Settings for this vessel (module toggles, labels, voyage settings below)

Calendar ................... /v/:vc/calendar?view=month|week|list&date=2026-11-22&cats=certificates,safety,crew,technical,charter,vessel,custom
                              ?event=new | ?event=:eventId   (drawer)
Reports .................... /v/:vc/reports?cat=all|crew|safety|compliance|vessel|operations&q=
   Report .................. /v/:vc/reports/:slug?<filters>   (slugs in the Reports table below)
```

**Voyage settings** (a section of vessel Settings, owned here): fuel grades in use and default unit, propulsion units (engines / generators / thrusters, metered or not), passage-plan gate (off / warn / block) and minimum bridge-team acknowledgements, noon-report reminder time, ship's default time-zone offset, which voyage checklists are required before departure / after arrival.

### Fleet view counterparts (not specified here)

| Vessel page | Fleet counterpart | Owner |
|---|---|---|
| Voyage Plans, Movement report | Fleet Reports › Movements (`/fleet/reports/movements`) | doc 02 R15; data from `voyage_reports_v` (this doc) |
| Emissions & Fuel (vessel) | Fleet Reports › Emissions & Fuel | doc 02 R16; data from `voyage_emissions_v` (this doc) |
| Tracking | Fleet Tracker `/fleet/tracker` | doc 02 T1–T4; shares the `VesselMap` component and `vessel_latest_position` |
| Calendar | Fleet Calendar `/fleet/calendar` | doc 02 C1–C6; same feed with one vessel |
| Charter Planner | Fleet season planner (the existing itinerary board) at `/fleet/planner` | this doc proposes the move; doc 02 retires "Fleet Scheduler" |
| Guest List | Fleet guest directory `/fleet/people?type=guest` (search a person across vessels, history of stays) | this doc |
| Voyage / Charter Checklists | Forms & Checklists `/fleet/forms/movement`, `/fleet/forms/charter` | doc 02 builder |

### Changes to the current nav

| Today | Target |
|---|---|
| Vessel › `Movement Reports` → placeholder `/vessel/general/movement-reports` | `Voyage Plans` → `/v/:vc/vessel/voyages` |
| Vessel › `Movement Checklists` → placeholder | `Voyage Checklists` → `/v/:vc/vessel/voyage-checklists` |
| — | Add `Tracking` under Vessel › Operations |
| Vessel › `Vessel Details` → `/vessels/list` (the fleet list) | `/v/:vc/vessel/details` (this vessel's record) |
| Vessel › `Emergency Contact` → `/vessels/emergency-details` (reads the global vessel selection) | `/v/:vc/vessel/emergency`; old path redirects |
| Vessel › `Management Company` → `/vessels/company-details` (mock data) | `/v/:vc/vessel/management` (real); `CompanyDetails.tsx` retired (doc 03 moves company facts to the Account page) |
| Vessel › `Communications`, `Flag & Class`, `Insurance`, `Billing` → placeholders | Real pages; add `Documents`, `Owner & Employer`, `Settings` |
| Charter › `Charters`, `Guest List`, `Checklists` → placeholders | Real pages; add `Planner` |
| Vessel Accounting › `APA Management` → placeholder | Stays in Accounting; reads `charter_apa_entries` (CH12) |
| No vessel Calendar; `/crew/calendar` reachable only from the sidebar quick link labelled "Fleet Calendar" | Vessel top-level `Calendar`; quick link renamed / pointed at `/fleet/calendar`; `/crew/calendar` redirects to the current vessel's calendar |
| No vessel Reports; `/reports` = incident analytics | Vessel top-level `Reports`; `/reports`, `/reports/incident-analytics`, `/reports/capa-tracker`, `/reports/drill-analytics` redirect to the matching vessel report (or the fleet hub for fleet roles) |
| Fleet › `Fleet Calendar` → `/itinerary/timeline` | `/fleet/calendar` (doc 02); itinerary board moves to `/fleet/planner` and is linked from each vessel's Charter Planner |

---

## Feature inventory

Status: complete / partial / placeholder / missing as defined in the brief. Priority P0–P2, effort S–XL for one engineer.

### Charter (§5.5.1–5.5.4, §3.19, §6.16)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| CH1 | Charters list: counters Total / Upcoming / Active / Completed; search (name, ref, area, guest, broker); status filter; include-past toggle; grid / list; columns status, charter (name + ref), dates + day count, route + cruising area, guests, rate, APA received, notes | §5.5.1 | placeholder | `sitemap.ts` 185 → Coming Soon | Page over `charters`; counters derived from dates **and** status consistently (W5); rate / APA columns only with the financial capability | P1 | M |
| CH2 | New / Edit charter form: type, status, name, start*, finish*, booking company, broker, client status, owner status; cruising area, pickup / drop-off port and time, adults, children, vessel entry, slip, marina contact, guest type; rate, commission %, net to owner, currency, owner's charter; notes; guest multi-select | §5.5.2, §3.19 | missing | — | Form with validation in W5; ports via the shared port picker (V14); net-to-owner computed as a default, overridable | P1 | M |
| CH3 | Charter reference | §5.5.3 | missing | `reference_counters` / `next_reference_value()` exist | `<CODE>-CH-<YYYY>-<seq3>` per vessel per year, assigned on create | P1 | S |
| CH4 | Charter detail with anchor nav: basic, logistics, financial, notes, vessel movements, checklists, damage claims, guests, crew, documents; Edit, Delete | §5.5.3 | missing | — | Read view with sticky anchor rail; each block has its own add action | P1 | L |
| CH5 | Charter status machine (Draft, Option, Live, On Hold, Cancelled, Completed) plus independent client status (Confirmed / Provisional / Cancelled) and owner status (Approved / Pending / Declined) | §6.16, image13 | missing | itinerary has its own unrelated status enum | Server-enforced transitions and guards (W5) | P1 | S |
| CH6 | Vessel movements overlapping the charter dates | §5.5.3 | missing | no voyages | Query voyages whose ATD/ETD–ATA/ETA overlap; link to each voyage; voyage records `charter_id` when created during a Live charter | P1 | S |
| CH7 | Start a charter checklist from the charter | §5.5.3 | missing | forms engine (`form_submissions`) has no charter link | `form_submissions.charter_id`; run list on the charter | P1 | S |
| CH8 | Damage claims (New claim) | §5.5.3, §10.2 | missing | — | STORM-designed register (W5b): item, location on board, guest stay, photos, estimate, status, settlement against deposit / APA | P2 | M |
| CH9 | Guests on the charter (Add guest, pick existing) | §5.5.3 | missing | — | `guest_stays.charter_id`; add from directory or create | P1 | S |
| CH10 | Assign crew to the charter (crew roles for the trip, e.g. guest liaison, tender driver) | §5.5.3 | missing | — | `charter_crew` (profile, trip role); default suggestion = crew onboard for the dates | P2 | S |
| CH11 | Charter documents (contract, preference sheet, itinerary, APA statements) | §5.5.3 | missing | — | Private bucket + `charter_documents`; financial documents need the financial capability | P1 | S |
| CH12 | APA: received, spent, balance; feeds the list's "APA received" column | §5.5.1, §10.2 | placeholder | `sitemap.ts` Accounting › APA Management → Coming Soon | `charter_apa_entries` ledger (received / spent / refunded); balance on the charter; Accounting reads the same rows | P2 | M |
| CH13 | "Charter" vs "Trip" label and module on/off per vessel | §5.5, §3.3 | missing | — | `vessel_module_settings('charter').label_override` (doc 01) applied in nav, titles, calendar, reports | P1 | S |
| CH14 | Charter Planner: year / month zoom, week columns, colour legend, show filter, bands **Vessel Movements** and **Charters & Trips** | §5.5.4 | partial | itinerary `TimelineView.tsx`, `PlanningGrid.tsx`, `GridToolbar.tsx`, `DraggableTripBlock.tsx` on `itinerary_entries` (fleet-wide) | Vessel-filtered planner with two lanes: voyages (from `voyages`) and charters / trips (from `charters`, plus non-charter itinerary entries); drag to reschedule only Draft / Option charters | P1 | M |
| CH15 | Cruising areas (39 regional options) | §5.5.2 | missing | itinerary `REGIONS` / `AREAS` constants (different lists) | `cruising_areas` table seeded with a STORM list; account can add / hide areas | P1 | S |
| CH16 | Fleet season planning, AI route suggestions, crew trip suggestions and votes, heat map | — (STORM extra) | complete | `itinerary/pages/FleetPlanningPage.tsx`, `TripSuggestionsPage.tsx`, `AIRoutePlanner.tsx`, `HeatMapTab.tsx`, `trip_suggestions*` tables | Keep; move to `/fleet/planner`; "push to vessel" creates Draft charters / trips instead of bare itinerary entries; fix auth on `ai-route-planner` (X3) | P2 | S |
| CH17 | Charter starting / ending notifications | §8.9 | partial | `notification_types` rows `charter_starting_soon` (7 days), `charter_ending_soon` (2 days); no sender | Daily job emits them; add `charter_status_changed` | P1 | S |
| CH18 | Passenger-limit and berth checks (STORM) | — | missing | `vessels.particulars.passengers`, `max_pob` (free text) | Warn when adults + children exceed guest berths, or exceed 12 on a vessel registered as commercial under a large-yacht code | P1 | S |

### Guests (§5.5.5, §3.19)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| G1 | Guest List: counters Total / Onboard / Expected / Departed; columns select, name (+ Private tag), status, nationality, ID number, issuing country, DOB; Add Guest; Export FAL 6 | §5.5.5 | placeholder | `sitemap.ts` 186 → Coming Soon | Page over `guest_stays` ⋈ person directory; filters by charter, status, date | P1 | M |
| G2 | Add / edit guest: name*, DOB, place of birth, nationality, gender, company, purpose of visit, status, arrival / departure dates, ID type, document number, issuing country, issue / expiry dates, phone (dial code), email, emergency contact name / phone, ports of embarkation / disembarkation, cabin, transit passenger, notes, preferences, allergies | §5.5.5 | partial | `hw_people` + `useHealthPeople.ts` (name, DOB, gender, nationality, email, phone, cabin, emergency contact, arrived / departed, notes) | Identity document fields (restricted table), ports, purpose, company, transit, preferences; allergies written to the Health allergy record (T3) | P1 | M |
| G3 | Guest status Expected → Onboard → Departed with actual embark / disembark time and port | §6.16 | missing | `hw_people.arrived_on` / `departed_on` (dates only) | `guest_stays.status` + timestamps; W6 | P1 | S |
| G4 | FAL Form 6 passenger list export (PDF + Excel) for a port call | §5.5.5, §5.8 Compliance Pack | missing | FAL 5 crew list exists: `crewListPdf.ts`, `OfficialCrewListDialog.tsx` | `fal6.ts` reusing the FAL 5 layout code; choose arrival / departure port and date; includes transit flag; vessel seal beside the Master block | P1 | M |
| G5 | Guest safety induction (alarm, raising the alarm, safety equipment, escape routes, muster station, lifejacket donning): who briefed, when, how, guest acknowledgement | §5.5.5 | missing | — | `guest_inductions`; required before status Onboard can be set without an explicit "briefing pending" flag; reminder until done (W6) | P1 | M |
| G6 | Central guest / occasional-worker directory: create once, assign to vessels / trips, onboard on one vessel at a time, repeat-guest history | #39, #32 | partial | `hw_people` is company-wide with `person_type` | Make `hw_people` the single non-crew person directory; stays per vessel; DB constraint "one open Onboard stay per person" | P1 | M |
| G7 | Guest PII protection and retention | storm.json `guest_list` note | missing | — | Identity documents T2, allergies / medical T3 (column-level, separate tables); purge identity numbers N months after departure (Open question 3); every export audited | P0 | S |
| G8 | Private guest (name masked in lists, calendar and planner for users without the guest-list capability) | §5.5.5 ("Private" tag) | missing | — | `guest_stays.is_private`; masked display "Private guest" | P1 | S |

### Charter checklists (§5.5.6)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| CC1 | Charter Checklists page: Manage checklists, Templates, History, recent runs, chips All / In progress / Never run, table checklist / runs / guest + New | §5.5.6 | placeholder | `sitemap.ts` 187 → Coming Soon; forms engine in `src/modules/ism/forms/*` | Page filtered to templates with area `charter` (doc 02 builder); a run may link a charter and a guest stay | P1 | M |
| CC2 | Seed charter templates (pre-arrival interior, galley daily, guest briefing, guest service, provisioning, tender / toys daily and end of day, crew certification check) | §5.5.6 | missing | — | Platform templates in our own wording, hidden by default per vessel | P2 | S |

### Voyage plans and movement reports (§5.6.1, §3.15, §6.10)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| V1 | Voyage Plans list: New Departure; AIS status strip (Moored / Underway, position, last update, View tracking); year / month filters; tabs Upcoming / Active / Past with counts; KPIs voyages, total distance, total time, average speed | §5.6.1, image45 | placeholder | `sitemap.ts` 221 → Coming Soon | Page over `voyages` + `voyage_kpis_v`; KPIs count completed voyages only and exclude harbour moves and voided voyages | P0 | L |
| V2 | Voyage card: ref, status, from → to, ATD / ATA, noon count + Add Noon (active only), departure / arrival report rows with time and status chip, checklists row + Add checklist, menu Copy to new draft / Edit voyage ID / Delete | §5.6.1, image45 | missing | — | `VoyageCard` component; report chip states draft / completed / signed / void | P0 | M |
| V3 | Voyage reference `<CODE>-<YYYYMMDD>-<seq3>`; editable ID | §1.6, §5.6.1 | missing | `next_reference_value()`; no `vessels.code` (doc 01 F9) | Number assigned on Confirm departure (drafts show the provisional "DRA-20261125 · draft"); scope per vessel per year; edit with uniqueness check and audit | P0 | S |
| V4 | Several draft plans in parallel, listed chronologically by planned departure, active voyage clearly distinguished, past toggle | #19, #41, #11 | missing | — | Any number of `draft` voyages; at most one `active` voyage per vessel (partial unique index) | P0 | M |
| V5 | Copy a voyage into a new draft (standing data carries over, variable data cleared and highlighted) | §5.6.1, #19 | missing | — | Carries route, waypoints, voyage type, passage plan content (as a new version), destination; clears times, fuel, POB, weather, signatures | P1 | S |
| V6 | Departure report (fields and rules in W2) | §5.6.1 | missing | — | Typed form; Save draft / Confirm departure | P0 | M |
| V7 | Noon report incl. computed average speed, time to go and slip % | §5.6.1 | partial | Deck log section `noon` in `logbooks/lib/templates.ts` 136 (position, distance, SOG, weather, fuel ROB, FW ROB, destination / ETA) | Voyage-linked noon report with the full field set; offer to create the deck-log entry from it (V21) | P0 | M |
| V8 | Arrival report incl. computed voyage summary (distance, duration, engine hours, average speed, fuel consumed) | §5.6.1 | missing | — | Typed form; summary computed in SQL from the voyage's reports | P0 | M |
| V9 | Read-only report header snapshot (vessel name, IMO, call sign, flag, voyage no., report time UTC, submitted by, Master) | §5.6.1 | missing | — | Snapshot frozen at completion so later vessel edits do not rewrite filed reports | P0 | S |
| V10 | Fuel: grades per vessel, explicit unit, bunkers with grade | §5.6.1, #23, #327 | missing | — | `vessel_fuel_grades`; unit fixed per vessel (no "≥ 5,000 means litres" guessing); bunker lines with grade, quantity, supplier, delivery note number | P0 | S |
| V11 | Propulsion configured per vessel (port / starboard mains, auxiliaries, thrusters), with or without individual fuel meters | #324 | missing | `particulars.engines` free text | `vessel_propulsion_units`; noon / arrival render one block per unit; consumption per metered unit or one whole-vessel figure | P1 | M |
| V12 | Master's signature on each report: Sign as / Someone else signing? / on the Master's behalf; signing saves; Revert to draft | §5.6.1, §8.2, §8.5, image7 | missing | logbook `logbook_sign_entry` and form `form_sign_submission` RPCs exist (different domains) | Slot spec in Workflows; signed reports locked; revert removes the signature with a reason | P0 | M |
| V13 | Suggestions from AIS and the vessel record (destination, draughts) with "Clear all suggestions (n)" | §5.6.1, §7.8 | missing | — | Suggestion chips sourced from `vessel_latest_position` (needs TR8) | P1 | S |
| V14 | Port picker: UN/LOCODE search with free-text fallback ("no port code recorded") | §5.6.1, §5.6.4 | partial | `ports` table (no LOCODE, unused); `geocode-search` (Nominatim) | Extend `ports` with `unlocode`; seed; company-scoped custom ports; shared `PortPicker` | P1 | M |
| V15 | Position entry (lat / lon) accepting decimal or degrees-minutes with hemisphere | §5.6.1 | partial | `logbooks/lib/telemetry.ts` (RMC parser, decimal fields) | `src/shared/lib/geo.ts` parse / format; store decimal degrees; "Use current AIS position" button | P0 | S |
| V16 | Route / waypoints / reporting points (up to 20) | §5.6.1, #49 | missing | — | `voyage_waypoints` (seq, name, lat, lon, planned ETA, is_reporting_point) shared with the passage plan | P1 | S |
| V17 | Attachments on every report (≤ 50 MB) | §5.6.1, §7.5 | missing | — | Private bucket `voyage-files` | P1 | S |
| V18 | Export PDF per report (and whole voyage pack) with vessel logo and seal | §8.8 | missing | `src/lib/pdf/pdfTemplate.ts` | `voyagePdf.ts`; footer shows the real status (the reference printed "Open" on a signed arrival) | P1 | M |
| V19 | Notifications: departure, noon and arrival reports (immediately), noon not filed, voyage checklist approval required | §8.9 | missing | notification types have none of these | Seed types; send on completion / signature; reminder W1 | P1 | S |
| V20 | Delete / void rules | §8.10, image6 | missing | — | Drafts deletable; signed reports never hard-deleted; departed voyages voided, not deleted (W1, W2) | P0 | S |
| V21 | Link to the Deck log | §5.4 (job → logbook), STORM logbooks | partial | Deck log `noon` and `watch` sections; `logbook_entries` immutable once signed | "Create deck-log entry" from a signed noon / departure / arrival report, prefilled as a **draft** entry for the officer to sign under logbook rules | P1 | M |
| V22 | POB prefilled: crew onboard at ATD from the crew list, guests Onboard from the guest list, others (occasional workers) | §5.6.1, #32 | missing | crew onboard status (doc 04 C4) | Prefill with "from crew list / guest list" provenance; override needs a note | P1 | S |
| V23 | Planner "Vessel Movements" lane fed by voyages | #20, #27, #228, #316 | partial | `frp_vessel_locations` (manual / sheet import) in the rotation planner | Rotation planner and Charter planner read voyages (actual) and draft voyages (planned); `frp_vessel_locations` kept for long-range estimates only | P1 | S |
| V24 | Pre-arrival pack: crew list as at ETA (FAL 5) + passenger list (FAL 6) for the voyage's arrival port | #306, §5.8 | partial | FAL 5 PDF / CSV (`crewListPdf.ts`) | "Pre-arrival pack" action on an active voyage; uses planned crew changes (doc 04 C11) | P1 | S |

### Passage plans and voyage checklists (§5.6.2)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| VC1 | Voyage Checklists page: Manage checklists, Templates, History, recent runs (status, name, started by, date), chips All / In progress / Never run, table grouped by phase (Pre-departure, Underway, Pre-arrival, In port) + New | §5.6.2 | placeholder | `sitemap.ts` 222 → Coming Soon | Page filtered to `movement` area templates (doc 02 builder) | P0 | M |
| VC2 | Attach checklist runs to a voyage from the voyage card (statuses Completed / Approved) | §5.6.1, §5.6.2 | missing | `form_submissions` has no voyage link | `form_submissions.voyage_id`; run shows on the card; template flag "required before departure / after arrival" | P0 | S |
| VC3 | Passage plan per voyage with status (Draft, Under review, Approved, Active, Completed, Not used), versions, alternatives for the same leg | #41, #19, #11, #3 | missing | — | `passage_plans` header + content on the forms engine; W3 | P0 | L |
| VC4 | Bridge-team "read and agreed" acknowledgements: configurable minimum per vessel, signed by each officer on their own account, tied to the plan version, re-acknowledge after revision | #41, #50 | missing | — | `passage_plan_acknowledgements`; W3 | P0 | M |
| VC5 | Pre-departure checklist template | §5.6.2 | partial | `ism/constants.ts` `PRE_DEPARTURE_CHECKLIST` (Master + Chief Officer signers) | Re-home as a `movement`-area platform template; add pre-arrival and passage-plan templates in our own wording | P1 | S |
| VC6 | Departure gate (off / warn / block): plan approved, minimum acknowledgements, required checklists done | — (STORM) | missing | — | Vessel setting; checked by `voyage_confirm_departure()` | P1 | S |

### Tracking (§5.6.4, §7.8)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| TR1 | Header: navigational state (Moored / Underway / At anchor), position, last update | §5.6.4 | placeholder | `FleetMap.tsx` random status | From `vessel_latest_position`; "stale" badge when the last fix is older than the provider's expected interval × 3 | P1 | S |
| TR2 | Map with nautical overlay toggle and the current / last voyage track | §5.6.4 | placeholder | `FleetMap.tsx` (CARTO dark tiles, fake positions); `react-leaflet` installed | Shared `VesselMap` (base: light / dark / satellite; overlays: OpenSeaMap seamarks, bathymetry); polyline from `ais_snapshots` for the selected voyage | P1 | M |
| TR3 | In-port card: position, draught, last arrival, last voyage, estimated fuel at berth (per day), data-confidence badge + details | §5.6.4 | missing | — | Card over `vessel_latest_position`, `ais_port_calls`, emissions model (W9) | P2 | M |
| TR4 | Particulars card (GT, LOA, ME power, year built, fuel type, cruising speed) with "Add" links for missing inputs that feed the fuel model | §5.6.4 | missing | — | Reads typed vessel columns (VR1); "Add" deep-links to Vessel Details field | P2 | S |
| TR5 | Port State Control card (last inspection, outcome, deficiencies, next window) | §5.6.4 | missing | audits / surveys pages (doc 06) | Card reading PSC-type surveys | P2 | S |
| TR6 | AIS voyage history: route, departed, arrived, distance, duration, fuel (est.), CO2, average speed, source (AIS / report) + open report; tags "AIS gap", "station keeping (DP)"; harbour moves hidden with "show"; show more; CSV | §5.6.4, §3.15 | missing | `ais_snapshots` table unused | `ais_voyages` built by W9; matched to `voyages` | P2 | XL |
| TR7 | Port calls (last 90 days): port, UN/LOCODE, arrived, departed, time in port | §5.6.4 | missing | — | `ais_port_calls` from W9 | P2 | L |
| TR8 | Live AIS provider integration on a schedule | §7.8 | placeholder | `ais-refresh` (mock generators for two providers) | Real provider adapter, cron schedule, destination / ETA / draught captured (doc 02 T1 shares this) | P1 | L |
| TR9 | `ais-refresh` defects | — | placeholder | `ais-refresh/index.ts` 134–159 (`mmsi_number`), 50–66 (random mock), 41–47 (in-memory cache), 101–123 (legacy role check) | Use `vessels.mmsi`; never persist mock data outside dev; cache in DB; auth by cron secret or capability `vessel.general.tracking.view` with vessel reach | P0 | S |
| TR10 | AIS-detected departure / arrival prompts the bridge to open or confirm the report (STORM) | — | missing | — | Notification "Draak appears to have left Antibes at 09:14 UTC — start the departure report?" with prefilled values | P2 | M |

### Vessel record and administration (§5.6.3, §3.3, §8.7)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| VR1 | Vessel Details (read-only view, inline Edit with Save / Cancel): identity and build, dimensions and capacity, propulsion and performance (field list in Data model) | §5.6.3 | partial | `vessels` typed columns (name, type, IMO, MMSI, call sign, flag, class society, GT, LOA, beam, draft, builder, build year, home port) + `particulars` JSON free text (`particularsSchema.ts`) edited in a modal from `VesselProfileCard.tsx` | Typed columns for the fields that feed calculations (GT, NT, power, consumption at cruise, fuel capacity, berths, DCS ship type…); free-text particulars kept as "More particulars"; page instead of modal | P1 | M |
| VR2 | Fill from registry (lookup by IMO / MMSI) | §5.6.3 | missing | — | Optional data-provider adapter; shows a diff and the user accepts per field (Open question 11) | P2 | M |
| VR3 | Vessel Logo (reports), Icon (vessel bar), Seal (beside the Master's signature on exports) | §5.6.3, §8.7 | missing | `useBranding` handles the company logo only | Three image slots (JPG / PNG / WebP / HEIC → stored as PNG / WebP, ≤ 5 MB); **seal printed** on FAL 5 / FAL 6 and every report sign-off block | P1 | S |
| VR4 | Communications: role mobiles (Captain, Chief Officer, Chief Engineer, Chief Stew), sat phone, Iridium, role emails, website, legacy numbers | §5.6.3, §3.3 | placeholder | `sitemap.ts` 224 → Coming Soon | `vessel_communications` repeatable rows; click-to-call / mail; legacy group collapsed | P1 | S |
| VR5 | Emergency Contact: SOS phone / email, office emergency team (repeating name, position, phone, email), Download PDF | §5.6.3, §3.3 | partial | `VesselEmergencyDetailsPage.tsx`, `emergencyContactsStore.ts`, `vessel_emergency_contacts` (heading, primary / secondary instruction, phone, email, revision history) | Office emergency team rows; one-page PDF card for the bridge; keep revision history | P1 | S |
| VR6 | Vessel Documents with vessel document types ("Add a document type") | §5.6.3 | missing | Documents module (`/documents`) is company document control | Vessel-scoped document list with types per vessel; reuse `documents` + `vessel_id` + type | P2 | M |
| VR7 | Management Company and ISM manager (DOC holder): name, management type, main phone, contacts, address | §5.6.3, §3.3 | placeholder | `CompanyDetails.tsx` (mock data, console save) | `vessel_parties` rows (roles `management_company`, `ism_manager`); DOC number and expiry linked from certificates | P1 | M |
| VR8 | Owner & Employer: employing company (from Fleet Employment), financial-security notice (from the P&I policy or written manually: insurer, reference, claims contact, what the cover provides) | §5.6.3, §3.3 | missing | — | `vessels.employing_company_id` (doc 02 `employing_companies`); `vessel_financial_security`; printable notice for posting on board | P1 | M |
| VR9 | Flag & Class: flag state, port of registry, flag phones / email / address; class society, notation, phones, emails, website, address | §5.6.3, §3.3 | placeholder | `vessels.flag_state`, `classification_society`, `flag_state_emergency_contact`, `class_emergency_contact` (free text) | `vessel_parties` roles `flag_state`, `class_society`; port of registry and notation typed | P1 | S |
| VR10 | Insurance: policies by type (P&I, Hull & Machinery, Crew Medical, other) with broker, policy number, cover, premium, start, end (from the insurance certificate), contacts, 24 h emergency, claims lead underwriter, notes | §5.6.3, §3.3 | placeholder | `insurance_policies` (unused); `compliance/pages/InsurancePage.tsx` (static) | Read / write doc 06 `vessel_insurance_policies`; end date shown from the linked certificate, not typed twice; premium T2 | P1 | M |
| VR11 | Billing: billing name, contact, phone, email, default currency, address | §5.6.3, §3.3 | placeholder | `sitemap.ts` 229 → Coming Soon | `vessel_parties` role `billing` + `vessels.default_currency` (used as the charter currency default) | P2 | S |
| VR12 | Settings page for the vessel | §5.6.3 (not captured) | missing | — | Doc 03 Vessel Settings rendered in vessel scope + Voyage settings section (this doc) | P1 | S |
| VR13 | Change history on record pages ("edited by … on …") | §7.6 | partial | Emergency contacts have revisions; `vessels.updated_by` only | Generic audit trigger on `vessels`, `vessel_parties`, `vessel_communications`; "History" drawer | P1 | S |
| VR14 | Identifier validation (IMO 7 digits with check digit, MMSI 9 digits, call sign) | §3.35 | partial | doc 03 specifies for Add Vessel | Same validators on the Details edit form; MMSI change warns that tracking re-binds | P1 | S |

### Calendar (§5.7, §3.22, §7.2)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| CAL1 | Vessel calendar with Month (all-day chips, "+N more"), Week (week number, all-day row, hourly rows) and List (Today / Tomorrow / This week / Later) views; Today, ‹ ›, Refresh, "Showing n events" | §5.7 | partial | `crew/pages/VesselCalendar.tsx` (Month + List, `/crew/calendar`) | Move to `src/modules/calendar`, add Week, list grouping, counts; route `/v/:vc/calendar` | P1 | M |
| CAL2 | Categories with fixed colours: Certificates, Safety, Crew, Technical, Charter (label follows Charter / Trip), Vessel, Custom; category filter | §5.7, §7.2 | partial | event types rotation / audit / yard / drill / travel / maintenance with ad-hoc colours | Category set + STORM theme tokens; legend doubles as filter | P1 | S |
| CAL3 | Generated events: certificate and insurance expiry, drills due and monthly drill reminders, crew embark / disembark, maintenance jobs and surveys due, maintenance periods, charter start / end, guest embark / disembark counts, voyage ETD / ETA / ATD / ATA, custom | §7.2 | partial | travel, audits, drills only (drill query has no company filter and relies on RLS) | `fleet_calendar_feed(from, to, vessel_ids, categories)` (doc 02) extended with this doc's sources (charters, voyages, guest stays) | P1 | L |
| CAL4 | Add / edit / delete custom event: title*, description, location, category (None = custom), start date*, single-day (default on → end date when off), all-day (default on → times when off) | §5.7, §3.22 | missing | no `calendar_events` table | Drawer form on `calendar_events` (doc 02) defaulting to this vessel | P1 | M |
| CAL5 | Category controls who can see the event (module permissions) | §5.7, §3.22 | missing | — | RLS on `calendar_events` and filtering in the feed by the category's module capability | P1 | S |
| CAL6 | Status tags Due soon / Overdue / Completed on generated items; click opens the source record | §5.7, §4.4 | missing | — | Status from the source (doc 02 W7) | P1 | S |
| CAL7 | Export (CSV of the view) and personal calendar subscription (ICS) | §5.7, §7.4 | missing | — | CSV client-side; ICS via a signed per-user token feed (doc 02 C6) | P2 | S |
| CAL8 | Per-vessel switches for calendar sources (e.g. hide leave, #10) | #10 | missing | — | `vessel_module_settings('calendar').settings.sources` | P2 | S |

### Reports (§5.8, §7.3)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| RV1 | Reports index: search ("try PSC, MLC, drills, expiry"), category chips with counts (All, Crew, Safety, Compliance, Vessel, Operations; a report can sit in several), grouped list with description and status | §5.8 | missing | `/reports` = Incident Analytics | Registry-driven index; "status" column shows data health (e.g. "3 items need action", "Beta", "No data yet") | P0 | M |
| RV2 | Report page shell: back to reports, title, "<Vessel> · generated <date time UTC>", filters in the URL + Apply, KPI tiles, table, Export PDF / CSV / Excel | §5.8, §7.4 | partial | exporters scattered (`crewListPdf.ts`, `work-rest/reports/exports.ts`, `documentExport.ts`); dead export buttons in incident, CAPA and drill pages | `ReportShell` + shared `exportTable()` (CSV / XLSX via `exceljs`, PDF via `pdfTemplate.ts` with vessel logo) | P0 | M |
| RV3 | Crew List (`crew-list`): views crew / next of kin / with contacts; filters all / onboard / inactive / rotation due soon, department, position; show phone / email / address; export | §5.8 | partial | `OfficialCrewListDialog.tsx`, `crewListPdf.ts` (FAL 5 PDF + CSV) | Report page with the views and filters; data contract doc 04 C11 | P1 | S |
| RV4 | Crew Biographies (`crew-biographies`): guest-facing PDF of selected crew with photo + biography; banner counts crew hidden for lacking either | §5.8 | missing | no biography field (doc 04 C21) | Card grid + PDF; only approved biographies (doc 04 open question 12) | P2 | S |
| RV5 | Crew Documents (`crew-documents`): tabs Overview / Action required / Detailed; by-crew and by-document KPIs; status per crew (complete / action required / expiring soon); Excel | §5.8, #248 | partial | `hr_expiry_items` view, `CrewCertificatesOverview` | Report over doc 02 `fleet_expiry_items` filtered to the vessel; add Rejected and Conditionally approved filters (#248) | P0 | M |
| RV6 | Vaccination Report (`vaccination-report`): valid / expiring / action needed / not recorded; Excel | §5.8 | partial | Health `med_vaccinations` | Report with T3 gating: non-clinical roles see status only | P2 | S |
| RV7 | Hours of Rest (`hours-of-rest`) | §5.8, §5.1.8, #292 | partial | `work-rest/reports/exports.ts` | Page owned by doc 04 C44; registered here | P0 | S |
| RV8 | Drill Compliance (`drill-compliance`): month + year; big % of applicable requirements met; counts overdue / evidence missing / awaiting approval / due soon / completed / not applicable / not due; per-drill rows with evidence and sign-off | §5.8 | partial | `DrillAnalytics.tsx` (charts, dead exports) | Report over doc 05 drill schedule data | P0 | M |
| RV9 | Drill Participation Matrix (`drill-participation`): crew × drill for the month, ✓ date / ✗ / —, Compliant / Missing n | §5.8 | partial | `drill_participants` | Matrix report + export | P1 | S |
| RV10 | Non-Conformance & Corrective Action (`corrective-actions`): 12-month window, status filter, KPIs raised / closed on time / closed late / open / overdue | §5.8 | partial | `CAPATracker.tsx` (export toast) | Report over doc 05 safety records | P0 | S |
| RV11 | Permit to Work Log (`permit-to-work`): from / to, type, status; #, type, location, opened, closed, authorised by, performed by, status | §5.8 | missing | `work_permits` table, `/ism/permits-to-work` list | Report + export | P1 | S |
| RV12 | Incident Reporting & Investigation (`incident-reporting`): from / to, type, status; KPIs and by-type counts | §5.8 | partial | `IncidentAnalytics.tsx`, `useIncidentAnalytics.ts` | Report table + export; vessel-scoped | P0 | S |
| RV13 | Annual Incident Summary (`incident-annual-summary`): year, scope vessel / fleet; totals, closed, open, average days to close, CAs raised, reports without CA, external notifications required / outstanding, linked medical cases; breakdowns by type, severity, category, activity, person type, onboard / ashore, time off, work-related, injury | §5.8, #69 | missing | — | Report shaped for a flag-state annual return; fleet scope for company roles | P1 | M |
| RV14 | Risk Assessment Register (`risk-assessments`): point-in-time; status and risk-level filters | §5.8 | partial | `/ism/risk-assessments` list | Report + export over doc 05 statuses | P1 | S |
| RV15 | Overdue Actions Summary (`overdue-actions`): overdue CAs and permits with days overdue and responsible | §5.8 | missing | — | Union report (CAs, permits past validity, plus STORM adds overdue jobs flagged critical) | P1 | S |
| RV16 | Safety Observation Trends (`safety-trends`): 3 / 6 / 12 months; incidents, near misses, hazardous occurrences by month | §5.8 | partial | incident trend chart in `IncidentAnalytics.tsx` | Report page + under-reporting note | P2 | S |
| RV17 | Compliance Pack (`compliance-pack`): one timestamped ZIP with a manifest (crew list FAL 5, guest list FAL 6, certificate register + files, HoR current and previous month, drills matrix, RA register, CAs, incidents, PTWs, filed SMS forms, completed checklists — 12 months — and familiarisation); admins, full-access and HoD only; audit-logged | §5.8 | missing | — | Server-side build (W8); manifest with SHA-256 per file; personal-data warning; short-lived download link | P0 | L |
| RV18 | Certificates Report (`vessel-certificates`): search, section, status (incl. no expiry / not uploaded), expiring-before date, KPIs; PDF, Excel, Download all | §5.8 | partial | `/certificates`, `CertificateAlerts.tsx` | Report over doc 06 `certificate_register_v` | P0 | M |
| RV19 | Movement Report (`movements`): year, month, status, voyage type; KPIs; voyage #, ports, ATD, ATA, Master, type, distance, duration, fuel, POB, status; PDF / CSV | §5.8 | missing | — | Report over `voyage_summary_v` | P1 | M |
| RV20 | Emissions & Fuel (`emissions`, Beta): period; fuel, CO2, CO2e, distance, hours underway / in port, measured share, fuel intensity; year-on-year carbon intensity; CO2 by month (at sea / in port); per-voyage estimated vs measured tags | §5.8, #232 | missing | — | `voyage_emissions_v` + estimation model (W9); method notes visible on the page | P2 | XL |
| RV21 | Report permissions and audit | §5.8 | missing | — | Each report requires `view` on its source module(s) plus `vessel.reports.reports.view`; Compliance Pack requires `vessel.reports.compliance_pack.export`; every export writes `report_exports` | P0 | S |
| RV22 | Scheduled report delivery (STORM extra): e.g. weekly Certificates report to the Captain, monthly Movement report to the office | — | missing | `send-email` function, notification types | `report_subscriptions` (report, params, cadence, recipients); reuse the export pipeline | P2 | M |

### Cross-cutting fixes found in this domain

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| X1 | Capabilities for this domain | §2, §8.6 | partial | `storm.json` vessel › `charter`, `general` | Add `sign` to `movement_reports`; add `vessel.general.passage_plans`, `vessel.general.tracking`, `vessel.charter.charter_financials`, `vessel.charter.damage_claims`; new modules `vessel.calendar.calendar_events` and `vessel.reports.{reports, compliance_pack}` | P0 | S |
| X2 | Users & Access "Charter" group grants the wrong module keys | — | partial | `users-access/lib/moduleGroups.ts` 18 (`meetings`, `reports`), `presets.ts` 44 (`fleet`) | Map to real `charter` keys; migrate existing grants with a report of who changes | P0 | S |
| X3 | Unauthenticated edge functions | — | partial | `config.toml` 69–77; `ai-route-planner`, `geocode-search` | `verify_jwt = true`, capability check, per-user rate limit, cache geocode results | P0 | S |
| X4 | `ports` RLS lets any tenant edit any port | — | partial | migration `20260214140830_*` lines 87–94 | Seeded ports read-only; custom ports company-scoped | P0 | S |
| X5 | Itinerary RLS: crew read other vessels' entries | — | partial | `itinerary_entries_select` | Filter by vessel reach in RLS through `itinerary_entry_vessels` | P1 | S |

---

## Workflows & state machines

All transitions run in SECURITY DEFINER RPCs that check capabilities and vessel reach (doc 01) and write an audit row; the UI never updates a status column directly. Times are stored in UTC with the ship's offset recorded on each report.

### Signature slots (this domain)

| Record | Slots in order | Eligible signer | Triggered by the slot |
|---|---|---|---|
| Departure / Noon / Arrival report | 1 Master | The vessel's current Master (`vessel_office_holders(vessel, 'master', report_at)`) → method **Verified**. Any other user with `vessel.general.movement_reports.sign` and command or officer tier → recorded as **on the Master's behalf**; the Master's name on the report does not change. Witnessed (shared device) allowed | Saves and locks the report (`completed` → `signed`). Arrival signed + all earlier reports signed → voyage `closed` |
| Passage plan | 1 Prepared by (planning officer) · 2 Approved by (Master) · then N "Read and agreed" (bridge team, any order) | Slot 1: user with `passage_plans.create`; slot 2: Master or on-behalf with reason; R&A: each officer on their **own account** (Verified only unless the vessel allows Witnessed) | Slot 2 → plan `approved`; when acknowledgements ≥ vessel minimum the departure gate for this plan is satisfied |
| Voyage checklist run | As defined on the template (doc 02 / 05) | Template office holders | Last slot → run `completed` (or `approved` if the template needs approval) |
| Charter checklist run | As defined on the template | Template office holders | Last slot → run `completed` |
| Guest safety induction | 1 Delivered by (crew) · 2 Guest acknowledgement (optional per vessel) | Any crew with `guest_list.edit`; guest signs on the device (Witnessed by the crew member) | Stamps `induction_completed_at` on the stay |

Removal follows the engine: reverse order only. Removing the Master's signature from a report is the **Revert to draft** action (reason required, audit row, notification to whoever received the original report).

### W1. Voyage (§6.10, image5, #19, #41)

```
            New departure / Copy to new draft
                        │
                        ▼
   ┌──────────────── draft ────────────────┐   (any number per vessel, sorted by ETD)
   │ Confirm departure (gate: required      │ Delete (no confirmed report, no signed plan/ack)
   │ fields; plan / acks / checklists       │ Mark "not used" (has signed plan or acks) ──▶ not_used
   │ per vessel setting; no other active)   │
   ▼                                        │
 active ── Add noon (repeat) ── active      │
   │                                        │
   │ Save arrival report (ATA)              │
   ▼                                        │
 arrived ── all reports signed ──▶ closed   │
   │                                        │
   └── Void (reason; command tier) ──▶ void ◀┘ (departed voyages are voided, never deleted)
```

- **Upcoming tab** = `draft` (and `not_used` when "show not used" is on); **Active** = `active`; **Past** = `arrived`, `closed`, `void` (void hidden unless toggled).
- **Who:** create / edit drafts and reports — `vessel.general.movement_reports.create|edit` (bridge officers, Master; HoD Engineering can edit engine and fuel blocks only, if field-level edit is enabled in Voyage settings); sign — `…movement_reports.sign`; void, edit voyage ID — command tier with `…movement_reports.delete`.
- **Guards:** one `active` voyage per vessel (partial unique index). Confirm departure requires departure port, ATD, destination, ETA, ETA > ATD, ATD ≤ now + 1 h. If another voyage is active, the user must file its arrival first (button "File arrival for DRA-…-036").
- **Numbering:** the sequence is taken on Confirm departure: `<CODE>-<YYYYMMDD of ATD (UTC)>-<seq3>`, seq per vessel per year. Edit voyage ID is allowed until `closed`; uniqueness per vessel; old ID kept in the audit row.
- **Charter link:** on confirm, if a `live` charter on this vessel covers ATD, `voyages.charter_id` is set (editable).
- **Copy to new draft:** see V5; the copy's passage plan starts as a new `draft` version, acknowledgements are not copied.
- **Delete rules:** a `draft` voyage with no confirmed report and no signed plan or acknowledgement can be hard-deleted by its creator or `delete` holders. Anything else is `not_used` (never departed) or `void` (departed). This replaces the reference behaviour where deleting all three reports silently removed a voyage.
- **Notifications:** departure report completed → "Departure: DRA-… left Antibes 09:14 UTC, ETA Palma 23 Nov 06:00 UTC" to subscribers of `voyage_departure_report` (immediately); noon → `voyage_noon_report`; arrival → `voyage_arrival_report`; **noon not filed** by the vessel's reminder time (default 14:00 ship time) while active → `noon_report_missing` to the Master and the officer who filed the departure; voyage `closed` → office subscribers.

### W2. Movement report (§6.10, image6, image7)

```
 (Add noon / open departure / open arrival)
        │ Save draft
        ▼
      draft ── Confirm departure / Save report (required fields valid) ──▶ completed ── Master signs ──▶ signed
        │                                                                     │  ▲                         │
        └── Delete ──▶ (gone)                       Delete (delete cap., reason)│  └── Revert to draft ◀──────┘
                                                                              ▼        (reason; removes signature)
                                                                            void
```

- Signing is allowed only when every required field is valid (the reference signed an arrival with "fields needed" counters showing; STORM does not). Signing a `draft` first validates and completes it, then signs, in one RPC.
- A `signed` report is read-only. Edits require Revert to draft; the revert, the reason and the before / after diff are kept, and the next signature records `signing_cycle + 1`.
- On completion the header snapshot (vessel name, IMO, call sign, flag, voyage ref, report time UTC + ship offset, submitted by) is frozen and the content hash computed; on signature the hash is stored with the signature.

**Field rules (in addition to the blueprint field lists in §5.6.1; units fixed per vessel):**

| Report | Required | Validation and computed values |
|---|---|---|
| Departure | departure port, ATD (UTC), destination, ETA (UTC) | ATD local = ATD + ship offset (offset editable, −12:00…+14:00); ETA > ATD; draughts 0–15 m (suggested from AIS); crew / guests / others prefilled (V22), POB = sum, warn if POB > max POB or guests > guest berths; ROB one row per active fuel grade; bunkers repeatable (grade, quantity, supplier, delivery note no.); wind direction as 16-point compass or degrees; Beaufort 0–12 (warn if wind speed inconsistent); sea state Douglas 0–9; swell m; visibility good / moderate / poor / fog; pressure 900–1,080 hPa; air −40…55 °C; sea −2…35 °C; readiness switches (safety briefing, emergency steering tested, navigation equipment checked, crew at stations); outstanding defects yes → text required + link to open technical defects; voyage type coastal / ocean / port hop / harbour move (harbour moves excluded from KPIs) |
| Noon | report time (default 12:00 ship time today, converted to UTC), latitude, longitude, distance run since last report | report time > previous report time and ≤ now; one noon per ship-date (warn on a second one); lat / lon parsed from decimal or degrees-minutes with hemisphere; course 0–359.9; speed 0–40 kn; distance made good ≤ distance run (warn otherwise); computed: hours since last report, average speed = distance run ÷ hours, time to go = distance to go ÷ average speed, slip % = (engine distance − distance run) ÷ engine distance × 100 when engine distance is given; propulsion block per configured unit (RPM, load %, pitch % for CPP, shaft power, running hours since last, counter total); engine mode full away / reduced / stopped / manoeuvring / drifting; consumption per metered unit **or** one whole-vessel figure (#324); 24 h-normalised daily rate computed; ROB per grade, fresh water, lube oil; destination update (next port prefilled, updated ETA, route changed → reason required); events last 24 h (with "raise incident" link), defects (with "log defect" link), Master's remarks |
| Arrival | arrival port, ATA (UTC), distance since last noon (or total if no noons) | ATA > last report time; pilot boarded ≤ first line ashore ≤ all fast / anchored (each optional); computed summary: departure port and ATD, noons filed, total distance = Σ noon distance run + distance since last noon, duration = ATA − ATD, average speed, engine hours = Σ, fuel consumed = Σ reported consumption **and** ROB(departure) + bunkers − ROB(arrival), with a variance flag above 5 %; POB with crew changes during voyage (yes → note); ROB at arrival per grade; bunkers during voyage + price per unit and currency (financial capability to view); weather at arrival; incidents (yes → incident reference required or "raise now"), damage / defects, safety equipment all satisfactory / issues (text); port formalities checklist: port authority, customs, immigration, health declaration, dangerous goods, waste for discharge, security pre-arrival information sent; next port |

### W3. Passage plan and bridge-team acknowledgement (#41, #50, #19, #11, §5.6.2)

```
 draft ── submit for review ──▶ under_review ── Master approves (slot 2) ──▶ approved ── voyage departs ──▶ active ── voyage arrives ──▶ completed
   ▲            │ return with comments                │  revise (new version)                     │ revise underway (new version, re-ack)
   └────────────┘                                     └─────────▶ draft (v+1) ◀─────────────────────┘
 any non-active version for the same leg ── choose another alternative / voyage not used ──▶ not_used
```

- A voyage can hold several plan **alternatives** (e.g. weather routing options); exactly one can be `approved` / `active` at a time; the others become `not_used` when one is approved (they stay readable).
- **Versions:** every revision after slot 1 is a new version; acknowledgements belong to a version. When a new version is approved, acknowledgements on the old one remain in history and the bridge team is asked to acknowledge again (notification `passage_plan_ack_required` to every officer in the vessel's acknowledgement group).
- **Acknowledgement group and minimum:** Voyage settings hold the list of positions that must acknowledge (default: Master, Chief Officer, all deck officers on the watch list) and the minimum count (default 4, maximum 10). Each acknowledgement records name, rank, time, signature method and version.
- **Departure gate** (VC6): `off` / `warn` / `block`. In `block`, Confirm departure is refused until the plan is `approved`, acknowledgements ≥ minimum and required pre-departure checklists are complete; the Master can override with a reason (recorded and shown on the voyage).
- **Content:** the plan's body is a `movement`-area template on the forms engine (appraisal, planning, waypoints / reporting points, tidal and weather notes, contingencies, VHF channels and reporting requirements), so fleets can author their own (#3). Standing fields carry over on copy (#19).

### W4. Voyage and charter checklist runs (§5.6.2, §5.5.6)

- Run lifecycle comes from the forms engine (doc 02 / 05): `in_progress` → `completed` → (`approved` if the template requires approval). Runs may link `voyage_id` and / or `charter_id`, `guest_stay_id`.
- Templates carry `phase` (pre_departure, underway, pre_arrival, in_port, charter_pre_arrival, charter_daily, charter_post) and a `required_for` flag (departure / arrival / none). Required runs show as empty slots on the voyage card ("Pre-departure checklist — not started").
- Notification `voyage_checklist_approval_required` when a run needing approval is completed (§8.9).

### W5. Charter (§6.16, image13)

```
 draft ── hold dates ──▶ option ── confirm ──▶ live ── finish date passed (nightly, system) ──▶ completed
   │                       │                    │ ▲
   │                       │                    ▼ │ resume
   │                       │                 on_hold
   └──────── cancel ───────┴──────── cancel ────┴──────────▶ cancelled ── reopen (admin, reason) ──▶ draft
 draft ── confirm directly ──▶ live
```

- **Guards:** finish ≥ start. `option` requires client status Provisional or Confirmed. `live` requires client status Confirmed and owner status Approved (owner's charters / trips are auto-Approved); an admin can override with a reason. Overlap on the same vessel: `live` vs `live` / `on_hold` is blocked; `option` overlapping anything shows a warning.
- **Completion:** a nightly job moves `live` charters to `completed` the day after the finish date (system actor, audited, reversible by an editor). List counters derive Upcoming / Active / Past from dates, and the status chip always agrees with them — the reference counted past "Live" charters as completed while still labelling them Live.
- **Cancel** asks for a reason and sets client status Cancelled unless the user chooses otherwise.
- **Who:** create / edit — `vessel.charter.charters.create|edit` (Master, Purser, Chief Stew, shore yacht manager by default); financial block (rate, commission, net to owner, currency, APA) — `vessel.charter.charter_financials.view|edit` (T2); delete — a `draft` or `cancelled` charter with no guest stays, documents, checklist runs or APA entries; otherwise cancel instead.
- **Notifications:** `charter_starting_soon` (7 days before start), `charter_ending_soon` (2 days before finish), `charter_status_changed` (to Live / On hold / Cancelled), `guest_induction_outstanding` (W6).
- **Planner:** creating or rescheduling a charter upserts its planner block (`itinerary_entries.charter_id`); dragging a Live charter is not allowed (edit dates in the form).

**W5b. Damage claim (STORM design; reference form not captured):** `open` (raised by crew: item / area, linked equipment, guest stay optional, description, photos) → `estimated` (cost, currency) → `claimed` (sent to broker / client, date) → `settled` (amount, method: deducted from deposit / APA / invoiced) or `waived` (reason). Only financial-capability holders see amounts.

### W6. Guest stay (§5.5.5, §6.16, #39)

```
 expected ── embark (time, port; induction done or "briefing pending") ──▶ onboard ── disembark (time, port) ──▶ departed
     │                                                                        │
     └── cancel (no-show) ──▶ cancelled                    undo embark (editor, reason) ◀┘
```

- **One person, one vessel:** a person can have only one `onboard` stay across the fleet (unique partial index on `person_id WHERE status = 'onboard'`). Embarking someone shown onboard elsewhere prompts "Disembark from Hydra first?".
- **Induction:** embarking without a completed induction requires ticking "briefing pending"; the Master and the guest-liaison crew get `guest_induction_outstanding` until it is recorded; the vessel cannot confirm a departure report with guests whose briefing is pending unless the Master overrides (setting, default warn).
- **Transit passengers** are flagged on FAL 6.
- **Retention:** identity-document numbers are erased N months after `departed` (Open question 3); name, nationality and stay dates remain for history and repeat-guest preferences.
- **Who:** `vessel.charter.guest_list.create|edit`; identity fields need `guest_list` T2 access; allergies and medical notes are written to the Health record and need T3 access to read.

### W7. Calendar (§5.7, §3.22, §7.2)

Follows doc 02 W7 (generated items are read-only projections with source status; custom events by creator or Read & Write holders of the event's category; "None" category visible to everyone on the vessel). Vessel specifics: Add Event defaults `vessel_id` to the current vessel; guest events show counts only ("3 guests embark") to users without guest-list access; charter events show the charter name only to holders of `charters.view` (others see "Charter"); voyage events (ETD / ETA from drafts, ATD / ATA from reports) belong to the Vessel category.

### W8. Report export and Compliance Pack (§5.8)

```
 requested ──▶ queued ──▶ building ──▶ ready ── link expires (1 h) / file purged (24 h) ──▶ expired
                               └──▶ failed (error shown, retry)
```

- Ordinary reports export in the browser from the data on screen (CSV / XLSX / PDF) and write a `report_exports` row (who, report, filters, format, row count).
- The **Compliance Pack** is built server-side by an edge function under the requester's identity (RLS still applies), writes each file plus `manifest.json` (file name, description, source, period, row count, SHA-256) into a private bucket, and returns a signed URL valid for 1 hour. Only account owner / admins, Full Access and HoD on that vessel can request it. Every request, build and download is audit-logged; the page warns that the pack contains personal data.
- Contents and periods as §5.8 (12 months for safety records plus older open CAs; HoR current + previous month; familiarisation all time). STORM adds, if the vessel has them, the latest closed Deck log and Oil / Garbage record volumes (Open question 10).

### W9. AIS ingestion, voyage detection and emissions estimate (§5.6.4, §7.8)

- **Ingest:** a scheduled function (every 15 min by default, provider-dependent) fetches positions for vessels with an MMSI and writes `ais_snapshots` (position, SOG, COG, heading, nav status, destination, ETA, draught, provider, received_at). Mock data is only allowed when the environment is not production and is written with `source_provider = 'mock'`, which every view excludes.
- **State:** `vessel_latest_position` derives Moored / At anchor / Underway with hysteresis (underway when SOG > 2 kn for two consecutive fixes, or nav status says so).
- **Voyage detection (nightly + on each fix):** a departure is the last in-port fix before SOG stays > 2 kn and the vessel leaves the port radius; an arrival is the first fix inside a port radius with SOG < 1 kn for 30 min. Each detected leg becomes an `ais_voyages` row with distance (great-circle sum of fixes), duration, average speed and tags: `ais_gap` (no fix for > 2 h underway), `station_keeping` (> 30 min below 0.5 kn outside any port radius), `harbour_move` (< 3 nm or < 30 min). Legs are matched to reported voyages by overlapping ATD–ATA and ports; matched legs show "Voyage report → Open".
- **Port calls:** consecutive in-port fixes form `ais_port_calls` (port, UN/LOCODE, arrived, departed, time in port).
- **Emissions:** per leg, fuel = reported consumption when the voyage has signed reports (measured), otherwise estimated: underway from the vessel's consumption at cruise speed scaled by (speed ÷ cruise speed)³ and capped at max power; in port from generator load (idle model, default 30 % of generator power, editable per vessel). CO2 = fuel (t) × the grade's CO2 factor from `emission_factors` (MGO / MDO 3.206, HFO 3.114, LNG 2.750 t CO2 / t fuel as defaults). Every figure carries "measured" or "estimated (model, inputs)". Fuel intensity = kg CO2 ÷ nm at sea.

---

## Data model

| Entity | Key fields | Existing STORM table(s) or NEW | Notes |
|---|---|---|---|
| Voyage | id, company_id, vessel_id, ref, ref_seq, ref_year, status (`draft`, `active`, `arrived`, `closed`, `not_used`, `void`), voyage_type (`coastal`, `ocean`, `port_hop`, `harbour_move`), departure_port_id, departure_port_text, departure_berth, etd_utc, atd_utc, destination_port_id, destination_port_text, eta_utc, ata_utc, route_summary, charter_id, copied_from_id, active_plan_id, gate_override_reason, void_reason, created_by, timestamps | NEW: `voyages` | Unique (vessel_id, ref); partial unique (vessel_id) where status = `active`; RLS by vessel reach + `movement_reports.view` |
| Voyage waypoint / reporting point | voyage_id (or plan_version_id), seq, name, lat, lon, planned_eta_utc, is_reporting_point | NEW: `voyage_waypoints` | ≤ 20 reporting points (#49); shared with the passage plan version |
| Movement report | id, voyage_id, vessel_id, kind (`departure`, `noon`, `arrival`), status (`draft`, `completed`, `signed`, `void`), report_at_utc, ship_offset_minutes, header_snapshot jsonb, master_profile_id, master_name, fuel_unit, data jsonb, schema_version, promoted columns: lat, lon, distance_run_nm, distance_made_good_nm, distance_to_go_nm, engine_distance_nm, main_engine_hours, fuel_consumed (per grade jsonb + total), rob (per grade jsonb), fresh_water_rob_l, lube_oil_rob_l, crew_count, guest_count, others_count, pob, signing_cycle, content_hash, completed_at / by, reverted_at / by / reason, void_reason, logbook_entry_id | NEW: `voyage_reports` | `data` validated by a zod schema per `schema_version`; promoted columns feed views and reports |
| Report signature | report_id, slot, signer, method (`verified`, `witnessed`, `on_behalf`), witness, signed_at, content_hash | Signature engine table (signatures doc) | Until it lands: `voyage_sign_report()` RPC writing a local `voyage_report_signatures` table with the same columns |
| Bunker delivery | report_id, grade_id, quantity, unit, supplier, delivery_note_no, price_per_unit, currency | NEW: `voyage_bunkers` | #327; price visible with financial capability |
| Report attachment | report_id, storage_path, file_name, mime, size ≤ 50 MB, uploaded_by | NEW: `voyage_report_files` + bucket `voyage-files` | |
| Vessel fuel grade | vessel_id, grade (`mgo`, `mdo`, `ulsd`, `hfo`, `lng`, `hvo`, `other`), label, density_kg_m3, is_primary, is_active | NEW: `vessel_fuel_grades` | #23: only active grades appear on reports |
| Propulsion unit | vessel_id, kind (`main_engine`, `aux_engine`, `generator`, `bow_thruster`, `stern_thruster`), label (e.g. "Port ME"), make, model, power_kw, has_fuel_meter, has_hour_meter, cpp (bool), equipment_id, sort_order, is_active | NEW: `vessel_propulsion_units` | #324; `equipment_id` links technical equipment (doc 06) so hour counters can feed readings |
| Voyage settings | vessel_id, fuel_unit (`t`, `m3`, `l`), default_ship_offset_minutes, noon_reminder_local_time, plan_gate (`off`, `warn`, `block`), plan_min_acks, plan_ack_positions[], allow_witnessed_ack, guest_briefing_gate (`off`, `warn`, `block`), engineering_edits_fuel_only | `vessel_module_settings('voyages').settings` (doc 01) | Typed via zod on read / write |
| Passage plan | id, vessel_id, voyage_id, leg_label, alternative_label, status (`draft`, `under_review`, `approved`, `active`, `completed`, `not_used`), current_version | NEW: `passage_plans` | One `approved` / `active` per voyage |
| Passage plan version | plan_id, version, form_submission_id, prepared_by / at, approved_by / at, change_summary | NEW: `passage_plan_versions` | Content lives in `form_submissions` (template area `movement`, kind `passage_plan`) |
| Plan acknowledgement | plan_version_id, profile_id, rank_snapshot, acknowledged_at, method, signature_ref | NEW: `passage_plan_acknowledgements` | Unique (plan_version_id, profile_id) |
| Checklist run link | voyage_id, charter_id, guest_stay_id on the run; template `area`, `phase`, `required_for` | `form_submissions` (+ columns), `form_templates` (+ columns, doc 02 adds `area`) | |
| Charter | id, company_id, vessel_id, ref, charter_type (`charter`, `trip`), status (`draft`, `option`, `live`, `on_hold`, `cancelled`, `completed`), name, start_date, finish_date, booking_company, booking_broker, client_status (`confirmed`, `provisional`, `cancelled`), owner_status (`approved`, `pending`, `declined`), previous_charter_id, reference_notes, cruising_area_id, pickup_port_id / text, pickup_time, dropoff_port_id / text, dropoff_time, adults, children, vessel_entry, slip_number, marina_contact, guest_type (`corporate`, `couples`, `family`, `group`, `other`), rate, commission_pct, net_to_owner, net_overridden (bool), currency (ISO 4217), is_owners_charter, notes, cancel_reason, created_by, timestamps | NEW: `charters` | Financial columns behind a SECURITY DEFINER view or column privileges for T2 |
| Cruising area | id, company_id (null = platform seed), name, region, sort_order, is_active | NEW: `cruising_areas` | STORM-authored seed list |
| Charter crew | charter_id, profile_id, trip_role | NEW: `charter_crew` | |
| Charter document | charter_id, storage_path, file_name, kind (`contract`, `preferences`, `itinerary`, `apa_statement`, `other`), is_financial, uploaded_by | NEW: `charter_documents` + bucket `charter-files` | |
| APA entry | charter_id, kind (`received`, `spent`, `refunded`), amount, currency, entry_date, reference, receipt_path, recorded_by | NEW: `charter_apa_entries` | Accounting › APA reads the same ledger |
| Damage claim | charter_id, ref, item, location_on_board, equipment_id, guest_stay_id, description, photos, estimate, currency, status (W5b), settled_amount, settlement_method, waived_reason | NEW: `charter_damage_claims` | |
| Planner block | charter_id on the itinerary entry | `itinerary_entries` (+ `charter_id`, + `vessel_id` denormalised for RLS) | Keeps the existing planner UI working |
| Person (guest / owner / visitor / contractor) | existing fields + company, place_of_birth, phone_dial_code, is_repeat (computed) | `hw_people` (extend) | Single non-crew person directory (see Implementation notes on doc 02 `visitor_people`) |
| Identity document | person_id, doc_type (`passport`, `national_id`, `driving_licence`, `other`), number, issuing_country, issue_date, expiry_date | NEW: `person_identity_documents` | T2; erased per retention rule |
| Guest stay | id, vessel_id, person_id, charter_id, status (`expected`, `onboard`, `departed`, `cancelled`), planned_arrival, planned_departure, embarked_at, embark_port_id / text, disembarked_at, disembark_port_id / text, cabin, purpose_of_visit, company, is_transit, is_private, preferences, notes, briefing_pending | NEW: `guest_stays` | Unique onboard per person (W6) |
| Guest induction | stay_id, topics jsonb (6 topics, each true), delivered_by, delivered_at, method (`briefing`, `video`, `card`), language, guest_ack_signature_ref | NEW: `guest_inductions` | |
| Guest allergies / medical notes | person_id, … | Health `med_allergies` / clinical tables | T3; the guest form writes through Health hooks |
| Custom calendar event | per doc 02 | NEW: `calendar_events` (doc 02) | Vessel calendar writes with `vessel_id` set |
| Calendar feed | per doc 02, plus sources `charter`, `voyage`, `guest_stay` | RPC `fleet_calendar_feed` (doc 02) | |
| AIS snapshot | per doc 02 (+ destination, eta, draught, received_at) | `ais_snapshots` (extend) | Partition by month; keep raw 90 days, then downsample to one fix per 30 min |
| Latest position | vessel_id, lat, lon, sog, cog, nav_state, destination, eta, draught, fix_at, provider, is_stale | NEW view `vessel_latest_position` (doc 02) | |
| AIS voyage | vessel_id, departed_at, arrived_at, from_port_id, to_port_id, from_locode, to_locode, distance_nm, duration, avg_speed_kn, tags[], is_harbour_move, voyage_id, fuel_t, fuel_basis (`measured`, `estimated`), co2_t | NEW: `ais_voyages` | Rebuilt idempotently by W9 |
| Port call | vessel_id, port_id, locode, arrived_at, departed_at | NEW: `ais_port_calls` | |
| Port | name, country_code, unlocode, port_type, lat, lon, radius_nm, timezone, company_id (null = seeded), is_custom | `ports` (extend; fix RLS) | Seeded rows read-only |
| Emission factor | fuel_grade, co2_t_per_t, ch4, n2o, co2e_t_per_t, source, valid_from | NEW: `emission_factors` | |
| Voyage views | per voyage: distance, duration, average speed, fuel by grade, POB, Master; per vessel-period KPIs; per voyage emissions | NEW views `voyage_summary_v`, `voyage_kpis_v`, `voyage_emissions_v` | Count `closed` + `arrived`; exclude `harbour_move`, `void`, `not_used` |
| Vessel identity and build | code (doc 01), registration_category (`private`, `private_vcc_uncertified`, `private_vcc_certified`, `private_commercial`, `yet`, `commercial`), launch_year, keel_laid_date, refit_year, hull_id, exterior_designer, interior_designer, naval_architect, official_number, port_of_registry, charter_company | `vessels` (add columns) | Back-fill from `particulars` where values parse |
| Vessel dimensions and capacity | length_registered, net_tonnage, deadweight_t, displacement_t, dcs_ship_type, hull_material, superstructure_material, fuel_capacity_l, water_capacity_l, guest_cabins, guest_berths, crew_cabins, crew_berths, max_pob | `vessels` (add columns) | Existing `length_overall`, `beam`, `draft`, `gross_tonnage` stay |
| Vessel propulsion and performance | main_engine_make, main_engine_model, total_power_kw, number_of_engines, cruising_speed_kn, max_speed_kn, range_nm, consumption_at_cruise_lph, generator_make, generator_model, generator_power_kw, electrical_system, fuel_type, propulsion_mode (`auto`, `conventional`, `diesel_electric`, `sail_primary`) | `vessels` (add columns) | Feeds W9; detailed units in `vessel_propulsion_units` |
| Vessel branding | logo_path, icon_path, seal_path | `vessels` (add columns) + private bucket `vessel-branding` | Signed URLs; PDFs embed the images |
| Communications | vessel_id, kind (`mobile`, `sat_phone`, `iridium`, `vsat`, `email`, `website`, `fax`, `other`), role_label, value, is_legacy, sort_order | NEW: `vessel_communications` | |
| Emergency contact | existing + office emergency team rows (name, position, phone, email, sort_order) | `vessel_emergency_contacts` (keep) + NEW `vessel_emergency_team` | |
| Vessel party | vessel_id, role (`management_company`, `ism_manager`, `flag_state`, `class_society`, `billing`, `registered_owner`), organisation_name, management_type, contacts jsonb (name, role, phone, email), phones[], emails[], website, address, details jsonb (role-specific: class notation, port of registry, DOC number), updated_by | NEW: `vessel_parties` | One row per role per vessel; zod schema per role |
| Financial security notice | vessel_id, source (`p_and_i_policy`, `custom`), insurance_policy_id, insurer, reference, claims_contact, cover_summary, valid_until | NEW: `vessel_financial_security` | For the notice posted on board |
| Insurance policy | per doc 06 | `vessel_insurance_policies` (doc 06); retire `insurance_policies` | Vessel › Insurance page is the editor |
| Default currency | default_currency (ISO 4217), employing_company_id | `vessels` (add columns) | Employing company table from doc 02 |
| Report export | id, company_id, vessel_id, report_key, params jsonb, format, status (W8), requested_by / at, storage_path, sha256, manifest jsonb, row_count, expires_at, downloaded_at / by, error | NEW: `report_exports` | Audit trail for every export |
| Report subscription | report_key, vessel_id, params, cadence, recipients, created_by, last_sent_at | NEW: `report_subscriptions` | RV22 (P2) |
| Report definition | key, slug, categories[], title, description, required capabilities, component, exporters | Code registry `src/modules/reports/registry.ts` | One registry for vessel and fleet reports (scope flag) shared with doc 02 |
| Notification types | `voyage_departure_report`, `voyage_noon_report`, `voyage_arrival_report`, `noon_report_missing`, `voyage_closed`, `voyage_checklist_approval_required`, `passage_plan_ack_required`, `passage_plan_approved`, `charter_status_changed`, `guest_induction_outstanding` | `notification_types` (seed rows) | Existing `charter_starting_soon` / `charter_ending_soon` kept |

---

## Improvements over the reference

1. **Several voyage plans at once, in order** (#19, #41, #11). Any number of drafts listed by planned departure, one clearly marked active voyage, and "copy previous voyage" that carries standing data (route, waypoints, reporting points, VHF channels) and clears and highlights what must change (times, fuel, POB, weather).
2. **Passage plans with a real approval and bridge-team sign-on** (#41, #50). Status, versions and alternatives per leg; a configurable "read and agreed" group signed by each officer on their own account; automatic re-acknowledgement after a revision; an optional departure gate. The reference showed one acknowledgement slot.
3. **Reports that fit the vessel** (#324, #23, #327). Engines, generators and thrusters configured per vessel; consumption per meter or one whole-vessel total; only the fuel grades the vessel burns; bunkers record grade and delivery note. No hidden "values over 5,000 are litres" rule: the unit is a vessel setting shown on every field.
4. **Up to 20 reporting points** per voyage (#49), shared between the passage plan and the noon positions.
5. **Signed means signed.** A signed report is locked; changes go through Revert to draft with a reason and a diff; signing is refused while required fields are missing; the PDF shows the true status (the reference printed "Open" on a signed arrival and filed it with missing fields).
6. **Less typing at noon.** "Use current AIS position", 12:00 ship time default converted to UTC, distance to go and time remaining computed, previous ROB shown beside each fuel field with the implied consumption, variance flag between reported consumption and ROB difference.
7. **No double entry with the Deck log.** A signed noon / departure / arrival report offers to create the matching Deck-log draft entry, so officers file once and sign the statutory book under its own rules.
8. **Planner lane from real movements** (#20, #27, #228, #316). Draft and actual voyages feed the rotation planner and the charter planner, so the vessel-movements lane no longer depends on a spreadsheet sync that breaks when a tab is reformatted.
9. **Pre-arrival pack in one click** (#306). From an active voyage: crew list as at ETA (FAL 5), passenger list (FAL 6) and the port formalities checklist, with the vessel seal beside the Master's block.
10. **One person, one record, one vessel at a time** (#39, #32). Guests, owner's party and occasional workers are created once in a fleet directory and given stays per vessel; the database prevents someone being onboard two vessels; repeat guests bring their preferences.
11. **Guest privacy by design.** Passport data in a separate restricted table and erased after a retention period; allergies and medical notes held in Health with T3 rules; "Private" guests masked everywhere for users without guest access; calendar shows counts, not names.
12. **Safety briefing that is actually recorded.** Who briefed whom, when, how, in which language, with optional guest acknowledgement; outstanding briefings chase the Master and can gate departure. The reference showed the topics but how acknowledgement happens was not visible.
13. **Charter status you can trust.** Status, list counters and the planner agree (the reference labelled past charters "Live" while counting them as completed); Live needs a confirmed client and an approved owner; overlapping Live charters are blocked; APA has a ledger instead of a column with no field behind it.
14. **The seal is printed.** Vessel logo and seal appear on FAL 5 / FAL 6 and every report's sign-off block (the reference stored a seal but no export used it).
15. **Tracking that explains itself.** Every AIS-derived number says whether it is measured or estimated and from what; stale positions are labelled; AIS-detected departures prompt the bridge to start the departure report (TR10).
16. **Calendar sources are switchable** (#10) and subscribable (ICS), with a "needs attention" count, and category visibility enforced in the database rather than only in the screen.
17. **Every export works, and every export is logged.** STORM's own incident, CAPA and drill pages have dead or "coming soon" export buttons today; the shared `ReportShell` fixes them, adds the status filters fleets ask for (#248), and writes `report_exports` for audit and GDPR.
18. **Annual incident summary for the flag return** (#69), by vessel and fleet.
19. **A Compliance Pack an auditor can verify.** Manifest with SHA-256 per file, period and source per item, short-lived download, full audit trail.
20. **Design.** The voyage page is a horizontal timeline (departure → noons → arrival) with each report as a card showing its signature state, a live summary rail (distance, average speed, fuel used, ETA drift) and a map strip of the track; report editors use a sticky section index with completion ticks, large touch targets for bridge tablets, offline-tolerant drafts (local autosave, server save on reconnect) and one consistent signature block. Charter detail uses the same anchor-rail pattern as STORM's crew profile. Colours come from STORM theme tokens with light and dark modes, not per-page hard-coded classes.

---

## Implementation notes

**New module folders**
- `src/modules/voyages/` — `pages/{VoyagePlansPage,VoyageDetailPage,ReportEditorPage,PassagePlanPage,TrackingPage,VoyageChecklistsPage}.tsx`; `components/{VoyageCard,VoyageTimeline,ReportHeader,PositionInput,PortPicker,FuelRobTable,PropulsionBlock,WeatherBlock,ReadinessChecks,PortFormalities,VoyageKpis,AcknowledgementPanel}.tsx`; `hooks/{useVoyages,useVoyageReports,usePassagePlan,useVesselPosition,useVoyageSettings}.ts`; `lib/{schemas.ts (zod per kind and schema_version),computations.ts (speed, slip, summaries — unit-tested),fuel.ts (unit conversion by density),voyagePdf.ts}`.
- `src/modules/charter/` — `pages/{CharterListPage,CharterFormPage,CharterDetailPage,CharterPlannerPage,GuestListPage,GuestStayPage,CharterChecklistsPage}.tsx`; `lib/{fal6.ts,charterRules.ts}`.
- `src/modules/calendar/` — move `crew/pages/VesselCalendar.tsx` here as `CalendarPage` (vessel and fleet modes); add `WeekView`, `ListView`, `EventDrawer`.
- `src/modules/reports/` — `registry.ts`, `components/ReportShell.tsx`, `lib/exportTable.ts`, one component per report, `pages/{ReportsIndexPage,ReportPage}.tsx`. Doc 02 proposed `src/modules/fleet/reports/registry.ts`; use one registry with a `scope: 'vessel' | 'fleet' | 'both'` field so the same report component serves both.
- Vessel record pages extend `src/modules/vessels/pages/` (`VesselDetailsPage`, `CommunicationsPage`, `ManagementPage`, `OwnerEmployerPage`, `FlagClassPage`, `InsurancePage`, `BillingPage`) with a shared `RecordSection` component (read view → Edit inline → Save / Cancel, History drawer).

**Reuse**
- Planner: `itinerary/components/{TimelineView,PlanningGrid,GridToolbar,DraggableTripBlock}.tsx` for the Charter Planner (vessel filter + two lanes). Move `applyAutoCompletion` (`useItinerary.ts` 55–65) into the nightly job so the database holds the real status.
- Rotation planner lane: `rotation-planner/hooks/usePlannerData.ts` reads `frp_vessel_locations`; add a union with `voyage_summary_v` (actual) and draft voyages (planned) behind a feature flag, keeping manual locations for long-range estimates.
- FAL lists: `crew/lib/crewListPdf.ts` already lays out the IMO FAL 5 form with `jspdf-autotable`; extract the header / vessel-particulars block into `src/lib/pdf/falCommon.ts` and build `fal6.ts` on it. Add the seal next to the Master block in both.
- PDFs: `src/lib/pdf/pdfTemplate.ts` (`createPDFTemplate`) for headers / footers; extend `PDFBranding` with `vesselLogoUrl` and `sealUrl`.
- Signing: until the signature engine ships, model `voyage_sign_report()` on `form_sign_submission()` (`20260919210000_ism_form_workflow.sql`: ordered, append-only, content hash) and resolve the Master with `vessel_office_holders()` (doc 01 F33), never with `profiles.role`.
- Numbering: `next_reference_value('voyage:' || vessel_id || ':' || year)` and `('charter:' || vessel_id || ':' || year)`; format with `format_reference()` (doc 01) once `vessels.code` exists.
- Position parsing: lift the coordinate logic from `logbooks/lib/telemetry.ts` (`parseRmc` coordinate helper) into `src/shared/lib/geo.ts` with `parseLatLon()` / `formatLatLon()` accepting `38.1233`, `-38.1233`, `38 07.4 S`, `38°07.4'S`, `38°07'24"S`; unit tests for each.
- Map: build `src/shared/components/map/VesselMap.tsx` on `react-leaflet` (installed) and replace the bespoke Leaflet code and `hashToCoord()` in `FleetMap.tsx` and `regionUtils.vesselCoord()` in `RegionMapCard.tsx` with `vessel_latest_position`.
- Guests: extend `useHealthPeople.ts` / `hw_people` rather than creating a second person table. Doc 02 proposes `visitor_people` + `vessel_visits` for visitors; recommend both docs converge on `hw_people` (persons) + per-vessel stay tables (`guest_stays`, `vessel_visits`) so one person can be a guest on one trip and a visitor on another without duplicates (#39).
- Insurance: build Vessel › Insurance on doc 06 `vessel_insurance_policies`; migrate any rows in `insurance_policies` (currently unused) and drop it afterwards.
- Emergency contacts: keep `emergencyContactsStore.ts` and its revision RPC; add the team table and a `emergencyCardPdf.ts`.

**Migrations (in order)**
1. Security fixes first: `ports` RLS (X4), `verify_jwt = true` + auth for `ai-route-planner` / `geocode-search` (X3), itinerary vessel-reach RLS (X5), Users & Access charter mapping (X2).
2. `vessels` typed columns + branding + default currency; back-fill from `particulars` (copy `particulars.mmsi_number` into `vessels.mmsi` where empty, then drop the key from `particularsSchema.ts`); `vessel_communications`, `vessel_parties`, `vessel_emergency_team`, `vessel_financial_security`; audit trigger.
3. `ports` extension (`unlocode`, `port_type`, `radius_nm`, `company_id`) and seed.
4. `vessel_fuel_grades`, `vessel_propulsion_units`, `voyages`, `voyage_waypoints`, `voyage_reports`, `voyage_bunkers`, `voyage_report_files` (+ bucket), signature table or engine hook, RPCs `voyage_create`, `voyage_confirm_departure`, `voyage_add_noon`, `voyage_save_report`, `voyage_sign_report`, `voyage_revert_report`, `voyage_void`, `voyage_edit_ref`; views `voyage_summary_v`, `voyage_kpis_v`.
5. `passage_plans`, `passage_plan_versions`, `passage_plan_acknowledgements`; `form_submissions` (+ `voyage_id`, `charter_id`, `guest_stay_id`), `form_templates` (+ `phase`, `required_for`).
6. `cruising_areas` (seed), `charters`, `charter_crew`, `charter_documents` (+ bucket), `charter_apa_entries`, `charter_damage_claims`, `itinerary_entries.charter_id` / `vessel_id`; nightly charter-completion job.
7. `hw_people` extension, `person_identity_documents`, `guest_stays` (+ partial unique index), `guest_inductions`; retention job.
8. `ais_snapshots` columns + partitioning, `vessel_latest_position`, `ais_voyages`, `ais_port_calls`, `emission_factors`, `voyage_emissions_v`; fix and schedule `ais-refresh`.
9. `report_exports`, `report_subscriptions`; Compliance Pack edge function `build-compliance-pack` (Deno; zip via an esm.sh build of a zip library; files written to private bucket `report-exports`).
10. Notification type seeds; `storm.json` capability additions (X1) and `node scripts/permissions/check-storm-coverage.mjs` at 100 %.

**Routing and navigation**
- Add the vessel routes under doc 01's `/v/:vesselCode` tree. Until that tree exists, register real routes **before** the placeholder map in `src/routes/index.tsx` and add their prefixes to `IMPLEMENTED_PREFIXES` in `sitemap.ts` (static placeholder paths outrank dynamic routes).
- Update `vesselVessel` and `vesselCharter` in `sitemap.ts`; add top-level `Calendar` and `Reports` groups to the Vessel tree; fix the sidebar quick links in `SidebarNavigation.tsx` (29–33) so "Fleet Calendar" and "Fleet Reports" point at the doc 02 pages.

**Pitfalls**
- **Two noon records.** The Deck log noon section and the voyage noon report must not drift. The voyage report is the operational record; the Deck-log entry is created from it as a draft for the officer to sign — never auto-signed (logbook rules, `docs/LOGBOOKS.md`).
- **Time zones.** Store UTC; record the ship's offset per report; the noon default is 12:00 *ship* time. Never derive ship time from the browser's zone (shore users file on the vessel's behalf).
- **Units.** Store the unit with every fuel figure; convert only through the grade's density; emissions need tonnes.
- **Reports count only filed data.** KPIs and the Movement report use `arrived` / `closed` voyages; drafts and `not_used` never appear in totals; `harbour_move` is excluded by default with a toggle.
- **AIS mock data.** The current function would write random positions into a production table; gate mock mode on environment and tag it.
- **AIS coverage and licensing.** Terrestrial AIS goes dark offshore; satellite AIS costs more. Label gaps instead of interpolating, and keep AIS-derived figures out of signed reports unless the officer accepts them.
- **Manual operational status vs AIS state.** `vessels.operational_status` (In Service, In Yard, Refit, Laid-up…) is a commercial status set by people; Moored / Underway comes from AIS. Show both; never overwrite one with the other.
- **Guest PII in derived places.** Calendar titles, planner blocks, notifications and exports must use the masking rules (W6, W7); test with a user who lacks guest access.
- **Client-side status.** The itinerary module computes "completed" in the browser; any new list must read status from the database.
- **Financial fields.** Rate, commission, net, APA and bunker price are T2; select them through a view or RPC that checks `charter_financials.view`, not by hiding columns in React.
- **Users & Access mapping.** Fixing X2 changes effective access for existing users; produce a before / after report and get sign-off before running it.

---

## Open questions

1. **Charter vs Trip default.** Should vessels default to "Trip" (private use) with financial fields hidden, and switch to "Charter" in Vessel Settings when they enter the charter market?
2. **Person directory.** Agree that guests, owner's party, visitors and occasional workers share `hw_people` as one fleet person directory (this doc) rather than a separate `visitor_people` table (doc 02)?
3. **Guest data retention.** How long after a guest disembarks should identity-document numbers be kept (e.g. 3, 6 or 12 months), and should repeat-guest preferences be kept indefinitely with consent?
4. **Departure gate.** Should the passage-plan / acknowledgement / checklist gate default to warn or block, and can only the Master override it?
5. **AIS provider and budget.** Which provider (terrestrial only, or satellite for ocean passages), what refresh interval, and should AIS-derived voyages be shown when no voyage report exists?
6. **Emissions scope.** Is the Emissions & Fuel report in v1, and is it a voluntary yacht carbon report or should it be shaped for IMO DCS / EU MRV-style submissions for vessels that fall under them?
7. **Signing on the Master's behalf.** Restricted to the Chief Officer (or a designated relief Master), or any officer holding the sign capability?
8. **Charter financial visibility.** Which on-board roles see rate, commission, net to owner and APA by default (Master and Purser only, or Chief Stew too)?
9. **Damage claims.** Needed in v1, and settled against the security deposit, the APA, or invoiced separately?
10. **Compliance Pack contents.** Keep the reference's 13 items only, or also include closed Deck-log and Oil / Garbage record volumes from the electronic logbooks?
11. **Fill from registry.** Is a paid vessel-particulars data source worth licensing for "Fill from registry", or do we drop the button?
