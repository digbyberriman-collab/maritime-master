# Migrations ledger fragment: fleet operations (X5)

Phase 3 wave 1 fragment of [`supabase/MIGRATIONS-LEDGER.md`](../MIGRATIONS-LEDGER.md) (platform prep PP1). Stream X5 Fleet operations records its migrations here, so the two streams never commit the same ledger file. The columns, statuses and rules are the main ledger's. The integrator folds this file into the main ledger at the wave-1 merge and deletes it.

**Block:** `2026112404` (files `2026112404*.sql`; gap/00 §3, fleet operations = hour 04). This fragment lists only files of this block, and each file appears in no other ledger file. `src/test/config/migrations.test.ts` enforces both.

**Queue prefix:** `F` (orders `F1`, `F2`, … in apply order, one per row of the ledger table below).

**Apply after:** main Apply queue order 23 and the wave-1 platform files the main queue lists after it. The crew rows (`C*`, [`crew.md`](crew.md)) apply after these rows.

**Live-behaviour notes for the owner's apply session:** each row says when applying it changes what users see or can do today (for example a guard trigger on a live table, or a fallback that switches off once the file is live, D-X5-20).

## Ledger

In version order. Every row starts as `written, not applied`, with a check query and an Apply queue order.

| # | File | Status | Evidence | Lovable copy | Notes |
|---|---|---|---|---|---|
| 1 | `20261124040000_fleet_expiry_engine.sql` | written, not applied | Tables `expiry_window_rules`, `expiry_sources`, the eight `expiry_src_*` views and functions `expiry_days_remaining`, `expiry_bucket`, `expiry_endorsement_state`, `expiry_default_window`, `expiry_window_for`, `set_expiry_window_rule`, `clear_expiry_window_rule`, `fleet_ops_can_for`, `fleet_ops_can`, `fleet_counted_vessels_for`, `fleet_current_crew`, `fleet_hod_covers`, `fleet_expiry_rows_for`, `fleet_expiry_items`, `fleet_expiry_summary` absent from `types.ts`; no copy. Verified on the DB harness (26 Nov 2026): legacy replay, fidelity, build-out pass 1 and pass 2, the one-definition scan, the contract, the ACL inventory and `fleet/*` (expiry_bucket, expiry_items, fleet_ops_can, expiry_rls) green. | — | X5-01A (gap/02 X2, X3; DECISIONS C5, D-31; D-X5-01, D-X5-02, D-X5-21, D-X5-22). The fleet expiry engine: per-company warning windows (`expiry_window_rules`; read by active members, written only through the two definers, gated by fleet reach and `fleet.operations.fleet_reports.admin`), the service-only source registry `expiry_sources` seeded with eight legacy sources (vessel certificates, insurance policies, legacy crew certificates, profile passports / visas, work authorisations, training certificates, medical fitness dates and status, active crew contracts), their source views (no browser grant), the pure bucket / endorsement / window functions (TS mirrors: `src/lib/records/expiry.ts`, `src/modules/fleet/lib/{endorsement,expiryWindows}.ts`), the fleet access helpers (`fleet_ops_can`, counted vessels, current crew incl. pending placements and planned joiners, HoD cover) and the browser RPCs `fleet_expiry_items` / `fleet_expiry_summary`. **Frozen at the X5-01A merge** (X1's crew-document files build on them): `expiry_bucket(date,integer,date,boolean)`, `expiry_window_for(uuid,text,uuid)`, `expiry_endorsement_state(date,date,integer)`, `fleet_current_crew(uuid[])`, the item types and the source-view column contract. **Live behaviour:** none changes (no live table, policy or function is touched); fleet expiry pages switch from "not set up yet" to real counts once applied. Re-running it never resets a registry row a later block changed (`ON CONFLICT DO NOTHING`). Idempotent. Check query F1. |

## Apply queue

| Order | File | Check first | If not live |
|---|---|---|---|
| F1 | `20261124040000_fleet_expiry_engine.sql` | Query F1 | Apply after ledger row 45 (main order 23) and the wave-1 platform rows after it (main orders 24, 25), before the crew rows (`C*`): X1's crew-document file calls this file's functions and writes its registry. The file refuses to run without its prerequisites (55000). Nothing in the app changes until the fleet expiry pages land; then the check query returns two non-null values. |

Check queries (read-only; run in the Supabase SQL editor): one per row, named in *Check first* and added in the same commit as the row.

```sql
-- F1. fleet_expiry_engine: both non-null means applied.
SELECT to_regclass('public.expiry_window_rules'), to_regprocedure('public.expiry_bucket(date,integer,date,boolean)');
```
