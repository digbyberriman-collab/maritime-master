# STORM Platform Audit — Phase 4: Action Plan

Sequences every finding in `AUDIT_REPORT.md` (finding IDs C-1…C-15, H-1…H-21, M-1…M-42, L-1…L-27) into workstreams, ordered by dependency first, severity second. Three items need an explicit product/architecture decision before code should be written against them — those come first. **Phase 5 (execution) does not start until the user reviews this plan and gives explicit go-ahead**, per the audit protocol and the scale of Critical findings already surfaced.

---

## Decisions needed before execution

These gate downstream work. Writing code against them before they're settled risks throwaway effort.

### D-1. Pick one RBAC root of trust
Blocks: C-14, C-15, M-1, M-2, M-3, M-4, M-11, and — more loosely — every fix in Workstream 2 that adds a role check (that new check should reference whichever table wins here). Two live systems exist: `user_roles`/`has_role()` (what Postgres itself trusts) and `rbac_user_roles` (what the admin UI manages, hundreds of live rows). Recommendation carried over from the prior audit: collapse onto `rbac_user_roles` + the module-RBAC helpers, retire `user_roles`/`has_role()`/`app_role`, migrating the handful of legacy bootstrap rows. This is the higher-leverage direction since it's already what the UI and 34 modules assume; keeping `has_role()` as-is would instead require rebuilding the admin UI's write path onto it. **Needs a decision, not just an implementation, because it changes which table every future RLS policy in this codebase should check.**

### D-2. Decide Refit's fate
Blocks: C-12, C-13, M-10. The module's entire schema (30 `rf_*` tables) doesn't exist in any migration; nothing in it can function today regardless of routing/RBAC fixes. Options: (a) locate/restore the missing migrations from wherever the module was ported from and finish the port, (b) rebuild the schema fresh against the existing `src/modules/refit` code as a spec, or (c) pull the module from navigation entirely until resourced. This is a scope/resourcing call, not something to default into. Until decided, C-13's routing fix is low-value (it would just make a still-broken module reachable) — hold it.

### D-3. Diagnose Health & Wellness's types.ts gap against the live DB
Blocks: H-3, and indirectly the credibility of the ~2,925 typecheck errors already logged against PR #31. One `SELECT` against the live project (`\dt hw_%` or equivalent) resolves whether migrations were never applied (in which case: apply them, the frontend has been silently broken) or `types.ts` was never regenerated (in which case: regenerate it, the frontend has likely been working fine). This is a 5-minute live-DB check, not an engineering decision — but nothing else in the Health module should be trusted as "confirmed broken" or "confirmed fine" until it's done.

---

## Workstream 1 — Cross-tenant data exposure (no dependencies, start immediately)

Highest severity-to-effort ratio in the whole report. Each item is a self-contained RLS/bucket-policy fix.

1. **C-1** — `crew_import`: add `company_id`, backfill, scope the SELECT policy.
2. **C-2** — `incident-attachments`/`crew-travel-documents`: add company-scoped policies + `file_size_limit`/`allowed_mime_types`.
3. **C-9** — `send-email`: require auth, stop caller-controlled `from`.
4. **C-11** — `inbound-webhook`: hash the shared secret, implement the HMAC check that already has dead code for it.
5. **L-23, L-24** — same-shape, lower-severity anonymous-access gaps (`geocode-search`, `equipment_categories`/`ports`) — bundle into the same PR since the pattern and reviewer context are identical.

No architectural decision needed; can run in parallel with the D-1/D-2/D-3 discussions.

---

## Workstream 2 — Close the "server control exists, UI bypasses it" pattern (5 instances, one PR series)

Same root shape everywhere: a role-gated edge function or trigger was built, and the actual UI writes the table directly instead. Fix as one coordinated batch so the pattern gets fixed once, reviewed once, and doesn't recur a sixth time.

1. **C-6** — Certificates: route `updateCertificate`/`renewCertificate` through `review-certificate`, or add `WITH CHECK` + status `CHECK`.
2. **C-7** — Drills/audits: wire drill-completion UI to `complete-drill`; add vocabulary `CHECK`s to `drills`/`audits`/`audit_findings`/`management_reviews`.
3. **C-8** — Incidents/CAPA: no edge function exists yet — build the trigger/guard directly (role + `verified_by ≠ assigned_to` + investigation-completed gate).
4. **C-3** — Admin-actions PIN step-up: check `admin_pins.last_confirmed_at` server-side (same "the client-side assumption isn't enforced" shape, different domain — include here for shared review context).
5. **C-10** — `sign-submission` PIN no-op: wire in the real `verifyPin` (this is the instance of the pattern that's already partially built — smallest fix in the batch).
6. **M-18** — Document approval: same shape, lower severity; build a `document_workflow_transition` RPC mirroring `form_sign_submission`.

Sequencing note: do C-8 (no existing function) after C-6/C-7 (adapt existing functions) so the team has two worked examples before building one from scratch. Depends partially on D-1 (whichever role-check helper wins should be what these new guards call) but the fixes are valuable even before D-1 lands — use `has_role()` OR `rbac_user_roles` consistently with whatever the codebase's current dominant pattern is per module, and revisit once D-1 resolves.

---

## Workstream 3 — Crew lifecycle correctness (one RPC, three findings)

1. **C-5** — Add `status`/`employment_status` to the guarded-column trigger; add a `CHECK` on `profiles.status`.
2. **H-4** — Build one `terminate_crew_member()` SECURITY DEFINER RPC that atomically sets all three status columns, closes the crew assignment, and transitions the active contract.
3. **M-19** — Extend the same RPC (or a sibling trigger) to guard `crew_contracts` transitions (require `terminated_at`+reason together, reject un-terminating).

Do C-5 first (it's the actively-exploitable one); H-4/M-19 can land as a single follow-up PR since they share the same new RPC.

---

## Workstream 4 — Dark mode + its dependent UI findings

1. **C-4** — Add the boot-time theme-apply effect (or adopt `next-themes`). This is the blocking item — nothing downstream is worth fixing until this lands, since H-14's badges look fine in light mode today.
2. **H-14** — Migrate the 35 hardcoded-light-palette files to semantic tokens. Do this *after* C-4 so the fix can be visually verified in actual dark mode, not just reasoned about.
3. **L-10** — Leaflet popup theming — lowest priority in this group, revisit last.

---

## Workstream 5 — Silent-failure / feedback gaps (independent, batchable by module)

No dependencies between these; genuinely parallelizable across different engineers.

- **H-11** — Global or per-page `isError` handling (pick the global `queryCache.onError` approach — one change covers all 14 currently-silent modules at once, lower effort than 14 per-page fixes).
- **H-12** — RBAC department-scope save feedback.
- **H-13** — Logbooks toast coverage.
- **H-9** — Certificate renewal transaction wrap.
- **H-10** — Documents server-side numbering.
- **M-14, M-15, M-16, M-17** — itinerary drag-reschedule, document-detail cache invalidation, list pagination, N+1 import loops.

---

## Workstream 6 — Accessibility remediation batch

Best done together since several share root components (the shell, the `Button`/`Card` primitives) and a single ESLint-rule investment (H-16's suggestion) pays off across the batch.

1. **H-15** — Duplicate `<h1>` (135 files — mechanical, script-assisted removal, then spot-check).
2. **H-16** — Icon-only button labels (185 sites — same mechanical treatment).
3. **H-17** — Contrast token rework (touches shared CSS variables — coordinate with Workstream 4's dark-mode work since both touch `index.css`).
4. **H-18** — Replace the two hand-rolled modals with `Dialog`/`Sheet`.
5. **M-27, M-28, M-29, L-11, L-12, L-13, L-14** — remaining a11y items, lower individual severity, same batch for reviewer context.

---

## Workstream 7 — Performance batch (low risk, mechanical)

1. **H-19** — Memoize `AuthContext`'s provider value + `useCallback` its functions.
2. **M-30** — Same fix, `VesselContext`.
3. **M-31, M-32** — Row-level memoization (`DocumentTable`, `CrewList`, `MaintenanceWidgets`).
4. **L-15, L-16** — `select('*')` narrowing, `RolesPermissionsPage` memoization.

Do H-19/M-30 first and re-profile before deciding how much of M-31/L-16 is still worth doing — memoizing the two big context providers may make some of the smaller re-render issues moot in practice.

---

## Workstream 8 — Dead-code cleanup (no dependencies, do anytime, good "gap filler" work)

1. **H-20** — Delete `src/lib/api/` (confirm zero external importers first).
2. **M-33** — Remove the duplicate `useCorrectiveActions` in `useIncidents.ts`.
3. **M-34** — Decide `usePDFExport`'s fate (wire in or delete) — resolve before or alongside M-35/M-36 since all three are "we built a shared thing and modules didn't adopt it."
4. **M-35, M-36** — Consolidate currency formatting and CSV escaping into `src/shared/lib/`.
5. **M-37, L-17, L-18** — dependency hygiene (`html2canvas`, `@tailwindcss/typography`, `xlsx`+`exceljs` overlap).
6. **L-19, L-20, L-21, L-22** — remaining dead exports, duplicate date/email helpers, the one live Documents "Edit" no-op.
7. Also fold in Phase 1's 29 already-identified dead components (`.audit-staging/phase1-routes-deadcode.md`) — same cleanup pass, same review.

---

## Workstream 9 — Remaining edge-function/auth hardening

Lower severity, independent items — good backlog for whenever capacity opens up between the above.

- **H-1, H-2** — login enumeration message, dead self-registration flow.
- **H-5** — `extract-flight-data`/`extract-form-fields` auth + SSRF allow-list.
- **H-6** — dead `next_reference` RPC (3 refit call sites — note: low priority if D-2 retires the module).
- **M-5, M-6, M-7, M-8, M-9, M-12, M-13** — config drift, missing tenant checks, unmetered LLM cost exposure, non-constant-time secret compares, orphaned invitation mechanism, login rate limiting.
- **L-1 through L-9** — remaining low-severity items from the auth-security and dependency reports.
- **L-25, L-26** — migration hygiene cosmetics.

---

## Workstream 10 — Documentation cleanup (trivial, no code risk)

- **H-21** — Correct/flag `docs/STORM-STATUS-AUDIT.md`'s Work & Rest claim.
- **M-42** — Archive or banner `AUDIT-REPORT.md` as superseded.
- **RETRACTED-2** — Add dated addenda to `docs/SYSTEM-AUDIT-2026-09-19.md`'s C2/C6 marking them fixed.
- **L-27** — Optionally add a CLAUDE.md indexing the now-many root-level audit docs.

---

## Suggested overall sequencing

1. Resolve **D-3** today (5-minute live-DB check) — unblocks confidence in H-3 either way.
2. Start **Workstream 1** immediately (no dependencies, highest severity-to-effort ratio).
3. Start **D-1** discussion in parallel; land **Workstream 2** once the discussion is far enough along to know which role-check helper to call (doesn't need to wait for full migration, just the decision).
4. **Workstream 3, 4, 5** can proceed in parallel with 1/2 — different code areas, different engineers.
5. **Workstreams 6-8** are good ongoing/gap-filler work throughout, not blocking anything above.
6. **D-2** (Refit's fate) can be decided whenever — nothing else in this plan depends on it except C-13/C-12/M-10 themselves.
7. **Workstreams 9-10** are backlog.

Phase 6 (QA/regression) should re-run after each workstream lands, not only at the very end, given how large this plan is — regression risk compounds if everything is validated only once at the finish.
