# Master Prompt: STORM blueprint build-out (continuous build loop)

> **How to use this prompt (for the product owner).** Open a Claude Code session on `maritime-master` and say: *"Follow `docs/blueprint/MASTER-PROMPT.md`. Continue from the tracker."* You can also paste this file. The prompt is self-resuming: each session reads the tracker in `BUILD-PLAN.md`, picks up the next open items, and leaves the tracker current when it stops. Run it as often as you like. It converges on "done" as defined in §8.
>
> To steer it, edit `DECISIONS.md` (product calls) or reorder `BUILD-PLAN.md` (priority). Don't edit this file for one-off steering.
>
> Everything below the line is addressed to the build agent.

---

## 0. Mission

Rebuild STORM (Maritime Master) to the operating model in the blueprint gap series, under a new dark-first look (Abyss). When you finish, STORM has:

1. **Two levels, as in the reference.** A **Fleet view** (`/fleet/…`) for oversight across all vessels the user can reach, and a **Vessel view** (`/v/:vesselCode/…`) for day-to-day work on one vessel. The vessel lives in the URL. Its modules (Crew, Safety, Certificates, Technical, Charter, Vessel, Calendar, Reports) sit in a tab row.
2. **STORM's own modules kept and placed properly.** HRIS, Health & Wellness, Yard (Refit, New Build), Legal and Shoreside become **workspaces**, reached from the Apps menu. Logbooks become a vessel tab.
3. **The shared engines, built once and used everywhere:**
   - expiry buckets
   - a record envelope with server-side transitions
   - ordered signatures (sign as, pass to, remove, stale-signature warning)
   - Company sign-off and status-update threads with "whose move"
   - per-vessel module settings
   - capability gates that fail closed
   - an audit trail
   - uploads up to 50 MB
   - exports (PDF, CSV, XLSX)
   - a notification outbox with deep links
   - a calendar feed
4. **Every P0 and P1 row in gap docs `01`–`10` delivered** or explicitly dropped in `DECISIONS.md`, with better behaviour than the reference wherever the gap doc's "Improvements over the reference" section says so.
5. **The Abyss design system everywhere:** dark by default, Daylight optional. Tokens only: no raw palette classes in module code.

---

## 1. Inputs (read in this order at the start of every session)

| # | File | Use |
|---|---|---|
| 1 | `docs/blueprint/BUILD-PLAN.md` | The queue and the tracker. **Start here.** Find the first phase with open items. |
| 2 | `docs/blueprint/DECISIONS.md` | Binding resolutions. **Overrides every gap doc.** |
| 3 | `docs/blueprint/gap/00-storm-architecture-and-conventions.md` | How code is laid out, registered, typed, migrated and tested. The skeletons in §4 are the house style. |
| 4 | The gap doc(s) for the items you picked | The spec: Target IA, feature inventory row, workflows and state machines, data model, implementation notes. |
| 5 | `docs/blueprint/gap/99-critic-review.md` | Known pitfalls in the docs themselves. |
| 6 | `docs/permissions/MASTER-PROMPT.md` + `addenda/storm.md` | The PMS v1 standard that the `useCan` adaptor converges on. |

The original blueprint and the ticket export are **not** in the repo and must never be added (DECISIONS D-07). If a gap row is ambiguous, decide in STORM's favour, record the decision in `DECISIONS.md` (new `D-*` row) and carry on.

---

## 2. Non-negotiables

1. **Keep `main`-bound work deployable.** The four gates pass before every push: `npm run lint` (0 errors, warnings ≤ baseline), `npm run typecheck`, `npm test`, `npm run build`. Never push red.
2. **Typecheck runs one at a time.** Use `flock /tmp/storm-tsc.lock npm run typecheck` (D-11).
3. **Never hand-edit `src/integrations/supabase/types.ts`**, `client.ts` or `previewAuthStorage.ts`. For tables that are not live yet, use the pending shim (`gap/00` D2).
4. **Never assume a migration is live.** Write it idempotent, add it to `supabase/MIGRATIONS-LEDGER.md` as `written, not applied` and make the UI degrade gracefully while the table is missing. A missing table shows a `ModuleOff`/`PageEmpty` state. It never crashes the page or falls back to mock data (D-01).
5. **Fail closed.** Gates deny while loading and for unknown keys. Never weaken RLS to make a page work.
6. **No personal data, no reference-product material** (D-07, D-08): no names, emails or phone numbers from tickets, and no reference brand, copy, screenshots or seed lists. Use roles. Write copy fresh.
7. **Tokens only.** No new raw palette classes, hex values or `dark:` variants in module code. Use semantic tokens, `StatusPill` and `KpiTile`. The palette ratchet only goes down.
8. **No new `any`.** Type new code. Remove stale casts in the files you touch.
9. **No fake success.** No timed "Export complete" toasts and no mock rows on error. Show real errors.
10. **Respect file ownership.** A domain stream edits only its module folder, its migration block (`gap/00` §3) and its tests. Hotspot files (`gap/00` §2) change only in platform items.
11. **Git.** Work on the session branch. Commit per item with a clear message. Push with `git push -u origin <branch>` and retry on network errors. Never force-push. Don't open a PR unless asked. Don't put model identifiers in commits or code.

---

## 3. The loop

Repeat until a stop condition (§7) is hit:

```
1. SYNC      git fetch; confirm you're on the session branch; read BUILD-PLAN tracker + DECISIONS.
2. PICK      The next open items in phase order. Items in one phase and different lanes/streams
             may run in parallel (max 2 concurrent implementers on a 4-CPU box).
3. SPEC      For each item, read the gap-doc rows it delivers + DECISIONS overrides. Write a
             short plan: files, migrations, tests, done-when check.
4. BUILD     Implement. Small, reviewable commits. Tests alongside code (gap/00 §4 "Tests per
             module"). Keep legacy paths working until the replacement is verified.
5. VERIFY    The four gates + the item's Done-when check. For UI items, run the app (Playwright,
             dark + light, 1440 px and 390 px) and look at the screenshots yourself.
6. REVIEW    Adversarial review of the diff against: the gap-doc spec, DECISIONS, non-negotiables,
             security (RLS, capability gates, tenant isolation), and regressions in untouched
             pages. Fix every confirmed finding; re-run VERIFY.
7. RECORD    Tick the item in BUILD-PLAN (Phase status + tracker row with commit hash + notes);
             add any new D-* decision; update supabase/MIGRATIONS-LEDGER.md. Commit + push.
8. NEXT      Back to 1. Every ~5 items, or at the end of a phase, run the phase audit (§5).
```

**Parallel execution.** When workflows are available, run each phase as one workflow:

- implementers per lane or stream, in worktree isolation for streams
- an integration step that merges, resolves and runs the gates
- a review panel that refutes findings before they are fixed
- a loop until review comes back dry twice

Phase 0 lanes can share one tree, because their file ownership is disjoint. Phase 3 streams use worktrees.

---

## 4. How to build each kind of item

- **Pages and routes.** Register them in the module's `module.ts` manifest once B8 has landed. Until then, add them through the platform-owned assembler with the lane owner's agreement. Vessel pages are declared relative to `/v/:vesselCode`, and links use `useScopedPath()`. Each page has a capability and a nav leaf `status` (`planned` / `beta` / `live`).
- **State machines.** Pure transition logic goes in `lib/` with exhaustive tests. Persistence goes through an RPC (`record_transition` or a domain wrapper). The client never writes `status` directly.
- **Data.** React Query with a key factory per entity. Scope ids go in every key. Select only the columns you need. Avoid N+1 queries.
- **Forms.** React Hook Form + zod (`lib/<entity>Schema.ts`), the shared form helpers, date-only strings in local time, and `useDraft` where `gap/08` asks for drafts.
- **Dates.** Calendar-day arithmetic comes from `@/lib/records/dates` (`daysBetween`, `addCalendarDays`, `daysBetweenOrNull` and the rest); a stream that needs a missing primitive files a hotspot follow-up instead of copying.
- **Migrations.** Use the skeleton in `gap/00` §4. Each table gets `company_id`, `vessel_id` when the data belongs to a vessel, a `CHECK` on status, RLS through `user_belongs_to_company` + `user_can_reach_vessel` + the domain `*_can_*` helper, `WITH CHECK` on writes, updated_at triggers and a `COMMENT`.
- **Edge functions.** Use the `_shared` helpers, `assertCapability` and the RLS-scoped client. Use the service role only when it is genuinely needed.
- **UI.** Build on the Abyss primitives (`StatusPill`, `KpiTile`, `DataTable`, `MatrixGrid`, page states). Dark-first; check Daylight too. Make touch targets at least 44 px on tablet layouts.

---

## 5. Phase audit (end of each phase, and every ~5 items)

Run an independent review that is not anchored on your own notes:

1. **Coverage.** For each gap row the phase claims, check the code does what the row and DECISIONS say. Downgrade the tracker where it doesn't.
2. **Regression.** Smoke every top-level route in the old and new trees. Check that legacy redirects resolve and that no page renders a blank or a crash.
3. **Security.** Check new tables for tenant and vessel isolation. Check that gates fail closed. Check that no function trusts client-supplied company or vessel ids without verifying them.
4. **Design.** Take screenshots of the shell and three representative pages in both themes. Check the palette ratchet trend.
5. **Docs drift.** Update gap docs only where they state a fact that the code has now made false (status columns). Spec changes go in DECISIONS.

---

## 6. Reporting (end of every session)

Leave the tracker current. Then give a short report:

- what landed (items with commits)
- what is in progress and where it stopped
- gate results
- decisions you made
- anything blocked on the product owner, including migrations that need applying through Lovable and the ledger rows to apply

---

## 7. Stop conditions

Stop and report when:

- **A gate is red** and two focused fix attempts haven't turned it green. Leave the branch at the last green commit.
- **A product decision would change scope materially.** Examples: building Finance, changing a regulated workflow's sign-off chain, or removing a STORM module. Record the question in DECISIONS as `OPEN` and continue with other items.
- **The work needs a live-DB action** (applying migrations, regenerating types) or a credential you don't have. Ledger it and continue with items that don't depend on it.
- **Phase 4 H5 passes.** That is done (§8).

---

## 8. Definition of done

- Every item in `BUILD-PLAN.md` is `[x]` or `[-]` with a reason.
- **The gates hold:** lint 0 errors with warnings below the 839 baseline, typecheck, tests and build all green.
- **The re-audit (H5) holds:** every P0 row in gap docs `01`–`10` is complete, and every P1 row is complete or explicitly scheduled or dropped.
- **The new model is in force:** the Fleet/Vessel scopes are the only navigation model, and legacy URLs redirect.
- **The design ratchet is met:** the palette ratchet is at its target and both themes pass AA on every token pair.
- **Hand-off is complete:** the migrations ledger lists every unapplied file in apply order, ready for the product owner.
