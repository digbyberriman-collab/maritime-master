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

## Apply queue

| Order | File | Check first | If not live |
|---|---|---|---|

Check queries (read-only; run in the Supabase SQL editor): one per row, named in *Check first* and added in the same commit as the row.
