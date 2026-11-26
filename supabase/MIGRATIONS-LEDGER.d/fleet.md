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

## Apply queue

| Order | File | Check first | If not live |
|---|---|---|---|

Check queries (read-only; run in the Supabase SQL editor): one per row, named in *Check first* and added in the same commit as the row.
