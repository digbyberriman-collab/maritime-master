# Migrations ledger fragment: crew (X1)

Phase 3 wave 1 fragment of [`supabase/MIGRATIONS-LEDGER.md`](../MIGRATIONS-LEDGER.md) (platform prep PP1). Stream X1 Crew records its migrations here, so the two streams never commit the same ledger file. The columns, statuses and rules are the main ledger's. The integrator folds this file into the main ledger at the wave-1 merge and deletes it.

**Block:** `2026112406` (files `2026112406*.sql`; gap/00 §3, crew = hour 06). This fragment lists only files of this block, and each file appears in no other ledger file. `src/test/config/migrations.test.ts` enforces both.

**Queue prefix:** `C` (orders `C1`, `C2`, … in apply order, one per row of the ledger table below).

**Apply after:** the fleet rows (`F*`, [`fleet.md`](fleet.md)), which apply after main Apply queue order 23 and the wave-1 platform files. One exception: `20261124061200_crew_import_tenancy.sql` (X1-13, crew import staging tenancy) may apply any time after main order 23.

**Live-behaviour notes for the owner's apply session:** each row says when applying it changes what users see or can do today (for example a changed live constraint or a guard on a live table).

## Ledger

In version order. Every row starts as `written, not applied`, with a check query and an Apply queue order.

| # | File | Status | Evidence | Lovable copy | Notes |
|---|---|---|---|---|---|
| 1 | `20261124060100_crew_reference_positions.sql` | written, not applied | Tables `ref_countries`, `ref_languages`, `departments`, `contract_types`, `positions`, `position_aliases`, `position_manning` and functions `crew_vessel_cap`, `crew_cap_vessel_ids`, `crew_vessel_gate`, `crew_position_synonym`, `crew_position_for`, `crew_positions_backfill`, `crew_positions_for_vessel`, `crew_vessel_unmatched_titles`, `crew_position_create`, `crew_vessel_positions_save`, `crew_position_alias_set` absent from `types.ts`; no copy. Verified on the DB harness (26 Nov 2026): build-out pass 1 and pass 2, the one-definition scan, the contract and `crew/reference_positions` green. | — | X1-01 (gap/04 C1, C12, C49, C70, C71; DECISIONS C22, D-X1-1, D-X1-2, D-X1-16). Global reference data (250 countries with demonym, dial code and flag; 91 languages; 13 departments; 3 contract types), about 100 STORM-authored system positions (every vessel role of `storm.json` with its tier), the per-company alias backfill from legacy titles and the listed positions per vessel. Reference tables read for active signed-in users; positions by row scope; aliases for company members; manning with `vessel.crew.crew_list.view`; no browser write policy (writes through the RPCs, gated by `vessel.crew.crew_compliance.admin`). **Live behaviour:** none changes; the positions drawer on the crew list (`?positions=1`) switches from "Positions are not set up yet" to the catalogue once applied. The seed runs `crew_positions_backfill()` once (idempotent). |
| 2 | `20261124060200_crew_vessel_list.sql` | written, not applied | Tables `crew_movements`, `crew_transfers` and functions `crew_status_decide`, `crew_vessel_members`, `crew_caller_is_external`, `crew_vessel_list`, `crew_vessel_movements`, `crew_movements_scope_guard`, `crew_transfers_scope_guard`, `crew_transfers_guard` absent from `types.ts`; no copy. Verified on the DB harness (26 Nov 2026): build-out pass 1 and pass 2, the one-definition scan, the contract and `crew/vessel_list` green. | — | X1-02 (gap/04 C3, C4, C7, C8, C9, C11; DECISIONS D-X1-4, D-X1-8, D-199, D-225, D-227). The vessel crew list as one definer RPC (`crew_vessel_list(vessel, day)`, gate `vessel.crew.crew_list.view`, no external viewer, email only with `crew_profiles.view`), the status derived per person and day (`crew_status_decide`: on transfer > pending > on leave > ashore > on board), the canonical membership helper `crew_vessel_members` (current, planned and pending placements; D-227 at the day), crew movements (stored plus derived from assignment dates) and the `crew_transfers` table with its engine-flag status guard (writers in X1-11). No browser write policy; nothing is seeded. **Live behaviour:** none changes; the vessel crew list (`/v/:code/crew/list`) switches from the basic list (with the notice "Showing the basic crew list…") to the server list with invitation states, the Movements tab and the as-at report once applied. |
| 3 | `20261124060300_crew_profile_details.sql` | written, not applied | Tables `crew_personal_details`, `crew_languages`, `crew_assignment_terms`, columns `crew_next_of_kin.phone_dial_code` / `mobile_dial_code` / `mobile_number` / `country_code` and functions `crew_profile_visible`, `crew_visible_profile_ids`, `crew_profile_structural_vessels`, `crew_profile_can_edit`, `crew_personal_field_groups`, `crew_personal_details_apply`, `crew_phone_split`, `crew_country_from_text`, `crew_profile_resolve`, `crew_profile_summary`, `crew_personal_details_save`, `crew_languages_save`, `crew_onboarding_save`, `crew_find_duplicates`, `crew_profile_details_backfill`, `crew_personal_details_scope_guard`, `crew_languages_scope_guard`, `crew_assignment_terms_scope_guard` absent from `types.ts`; no copy. Verified on the DB harness (26 Nov 2026): build-out pass 1 and pass 2, the one-definition scan, the contract and `crew/profile_details` green. | — | X1-03 (gap/04 C16, C17, C19, C20, C21, W1, T-68; DECISIONS D-X1-2, D-X1-13, D-X1-19, D-199, D-225, D-229, D-233, D-246). The routed crew profile's server: personal details (identity, contact, address, phones as dial code + national number, biography), languages (mother tongue + three with proficiency), employment terms (contract type, review date, leave allowance, embarkation; advisory link to the assignment), profile visibility (the person; `vessel.crew.crew_profiles.view` on a vessel of their structural set; legacy HR viewers; externals only their own), the resolve / summary RPCs, the saves with field groups (self fields by the person, identity fields by an editor: `hr_can_edit` or `crew_profiles.edit`), Add Crew's onboarding save and duplicate check (`crew_profiles.create`). Reads through RLS (`crew_visible_profile_ids`, hoisted); no browser write policy. The backfill carries date and place of birth, the phone (split), nationality (to an ISO code), sex and embarkation port from `profiles` into `crew_personal_details` once (idempotent). **Live behaviour:** none changes for existing pages; `crew_next_of_kin` gains four nullable columns with named CHECKs / FK (validated; existing rows unaffected). The crew profile (`/v/:code/crew/people/:id`) switches from the basic read-only view ("Saving these details becomes available once the crew update is applied.") to editable Personal and Contact tabs with the switcher once applied. |

## Apply queue

| Order | File | Check first | If not live |
|---|---|---|---|
| C1 | `20261124060100_crew_reference_positions.sql` | Query C1 | Apply after the fleet rows (`F*`) and after main order 25. Needs `has_capability_for()` with the crew keys (platform prep PP1, main order 23 or later). Then open a vessel's crew list with `?positions=1` as a fleet manager: the vessel's held positions are listed, and an unmatched title shows under "Unmatched titles". |
| C2 | `20261124060200_crew_vessel_list.sql` | Query C2 | Apply right after C1 (it needs C1's gate helpers, positions and `crew_position_for`) and after main orders for `20261123010200` (invitations) and `20261123020000` / `020100` (record helpers). Then open a vessel's crew list as a fleet manager: the rows come from `crew_vessel_list` (no "basic crew list" notice), a crew member added without a sign-in reads "Pending login", and the Movements tab lists the joins and departures of the last three months. |
| C3 | `20261124060300_crew_profile_details.sql` | Query C3 | Apply right after C2 (it needs C1's gate helpers and reference tables and C2's `crew_vessel_members` / `crew_status_decide` / `crew_caller_is_external`). Then, as a fleet manager, open a crew member's profile from the crew list (View profile): the Personal tab saves (title, date of birth, nationality), the Contact tab saves an address and a phone with its dial code, the previous / next switcher steps through the vessel's crew, and an old `/v/:code/crew/people/<login id>/personal` link lands on the `profiles.id` URL. |

Check queries (read-only; run in the Supabase SQL editor): one per row, named in *Check first* and added in the same commit as the row.

```sql
-- C1. crew_reference_positions: true means applied.
SELECT to_regclass('public.positions') IS NOT NULL
   AND to_regclass('public.position_manning') IS NOT NULL
   AND to_regclass('public.ref_countries') IS NOT NULL
   AND to_regprocedure('public.crew_positions_for_vessel(uuid)') IS NOT NULL
   AND to_regprocedure('public.crew_cap_vessel_ids(text)') IS NOT NULL
   AND (SELECT count(*) FROM public.positions WHERE company_id IS NULL) >= 100 AS applied;
```

```sql
-- C2. crew_vessel_list: true means applied.
SELECT to_regclass('public.crew_movements') IS NOT NULL
   AND to_regclass('public.crew_transfers') IS NOT NULL
   AND to_regprocedure('public.crew_vessel_list(uuid,date)') IS NOT NULL
   AND to_regprocedure('public.crew_vessel_movements(uuid,date,date)') IS NOT NULL
   AND to_regprocedure('public.crew_vessel_members(uuid,date)') IS NOT NULL
   AND to_regprocedure('public.crew_status_decide(boolean,text,text,text)') IS NOT NULL AS applied;
```

```sql
-- C3. crew_profile_details: true means applied.
SELECT to_regclass('public.crew_personal_details') IS NOT NULL
   AND to_regclass('public.crew_languages') IS NOT NULL
   AND to_regclass('public.crew_assignment_terms') IS NOT NULL
   AND to_regprocedure('public.crew_profile_summary(uuid,uuid)') IS NOT NULL
   AND to_regprocedure('public.crew_personal_details_save(uuid,jsonb)') IS NOT NULL
   AND to_regprocedure('public.crew_visible_profile_ids()') IS NOT NULL
   AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'crew_next_of_kin' AND column_name = 'mobile_dial_code') AS applied;
```
