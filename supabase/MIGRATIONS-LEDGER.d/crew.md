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

## Apply queue

| Order | File | Check first | If not live |
|---|---|---|---|
| C1 | `20261124060100_crew_reference_positions.sql` | Query C1 | Apply after the fleet rows (`F*`) and after main order 25. Needs `has_capability_for()` with the crew keys (platform prep PP1, main order 23 or later). Then open a vessel's crew list with `?positions=1` as a fleet manager: the vessel's held positions are listed, and an unmatched title shows under "Unmatched titles". |

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
