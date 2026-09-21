# Phase 2 — Documentation Consistency Audit

Scope: root-level and `docs/` markdown, module-level docs vs. code/migrations, a sample of
inline comments, contributor-instruction files, and client-side env var documentation.
Read-only — nothing on disk was changed except this report. All checks below were run
against the working tree on `claude/nice-pascal-ar3hbe` on 2026-09-21.

---

### [DOCS] — SYSTEM-AUDIT's Critical "CI has never passed" finding is stale; lint now passes with 0 errors
Severity: High
Location: docs/SYSTEM-AUDIT-2026-09-19.md:22 (exec summary item 3), :271 ("Lint." paragraph), :304 (finding C6), :391 (checks table)
Description: The audit states as a live, blocking Critical finding that "CI has never passed. Every GitHub Actions run fails at the lint step on two pre-existing errors" and quotes "863 problems, 2 errors, 861 warnings" (`no-control-regex` in `supabase/functions/extract-form-fields/docx.ts:76`). Running `npm run lint` against the current tree returns `839 problems (0 errors, 839 warnings)` — zero errors. Git history shows why: commit `9cc26fd` ("Unblock CI: fix the two lint errors and redact the leaked token", 2026-09-19 17:39:03) landed 42 minutes after the audit doc was first committed (`3c24c3f`, 16:57:09), fixing exactly the two errors the doc cites. The doc was edited again later the same day (`14899463`, 22:43:37, adding "Addressed" notes to H5/H6) but C6 and the exec-summary/Lint sections were never updated to reflect the fix.
Impact: A reader (human or agent) who opens this document — the single most comprehensive audit report in the repo — will conclude CI is currently broken and treat "unblock CI" as an open Critical action item, when the specific defect described was already fixed hours after the document was written. Combined with typecheck/test/build already passing per the same document, the practical implication ("CI has no automated protection on `main`") is very likely no longer true.
Suggested fix: Add a dated addendum to C6 (matching the style already used for H5/H6) noting that the two lint errors were fixed in `9cc26fd` same day, and re-run `npm run lint` to confirm before relying on this finding in Phase 3.

### [DOCS] — SYSTEM-AUDIT's Critical "leaked token in MIGRATION-PLAN.md" finding is stale; the file is already redacted
Severity: Medium
Location: docs/SYSTEM-AUDIT-2026-09-19.md:21 (exec summary item 2), :300 (finding C2); MIGRATION-PLAN.md:56
Description: The doc's second executive-summary point and finding C2 state the GitHub PAT "is written in plain text inside `MIGRATION-PLAN.md`'s 'Stage 0' section on main" and "the document must be scrubbed." The same commit `9cc26fd` that fixed the lint errors also redacted this token: `MIGRATION-PLAN.md:56` currently reads `<leaked token, redacted; revoke at github.com/settings/tokens>`, not a real token value. As with the lint finding above, this fix landed after the audit doc's first commit but the doc was never updated to mark it resolved, unlike the pattern used for H5/H6.
Impact: A reader relying on this document to prioritize remediation would flag "scrub MIGRATION-PLAN.md" as still outstanding when the plaintext token is already gone from the current file (the underlying git-history exposure and the need to revoke the token itself still stand — only the "written in plain text in the file today" part is stale).
Suggested fix: Add a dated addendum to C2 noting the file was redacted in `9cc26fd`; keep the still-valid parts of the finding (token remains in git history; must still be revoked on GitHub) clearly separated from the now-fixed "plaintext in the current file" claim.

### [DOCS] — docs/STORM-STATUS-AUDIT.md calls Work & Rest "Production-ready" / part of the "Strong MVP Core"; it is confirmed non-functional
Severity: High
Location: docs/STORM-STATUS-AUDIT.md:14, :26, :71
Description: The verdict section lists "work-rest" under "Core ops ... substantially real," the architecture diagram places `WorkRest` inside the "Strong MVP Core" subgraph, and the maturity table rates "Incidents / drills / work-rest" as "Production-ready." SITE_MAP.md (this audit's own Phase 1 output), HRIS-AUDIT.md:22,98,225, and docs/SYSTEM-AUDIT-2026-09-19.md (finding C4, and its own §2.3 note about the two docs disagreeing) all independently confirm the routed Work & Rest module queries nine tables (`work_rest_*`, `vessel_work_rest_settings`) that are absent from `types.ts` and, per HRIS-AUDIT.md, may never have been applied to the live database at all — i.e. the statutory MLC 2006 rest-hour record cannot currently be kept. SYSTEM-AUDIT-2026-09-19.md already records that these two documents disagree and states it trusts HRIS-AUDIT.md's account, but STORM-STATUS-AUDIT.md itself carries no correction, cross-reference, or superseded notice — a reader who opens only that file gets the wrong answer with no signal to check elsewhere.
Impact: Anyone (including a future audit agent) who reads docs/STORM-STATUS-AUDIT.md in isolation — a very plausible thing to do given its title — will be told a statutory-compliance-critical module is production-ready when it is one of the most broken modules in the codebase (SYSTEM-AUDIT-2026-09-19.md rates this Critical, C4).
Suggested fix: Add a note at the top of docs/STORM-STATUS-AUDIT.md pointing to docs/SYSTEM-AUDIT-2026-09-19.md as the corrected, later account, or strike the "work-rest" / "Production-ready" claim directly.

### [DOCS] — AUDIT-REPORT.md's file paths no longer exist; the whole document predates the modules/ restructuring
Severity: Medium
Location: AUDIT-REPORT.md:1-2 (dated 2026-02-01), :29-35 (file list)
Description: This root-level report, dated 2026-02-01 ("1/1 tests pass"), lists bugs/warnings at paths such as `src/components/crew/AdminPinModal.tsx`, `src/components/crew/CrewFormModal.tsx`, `src/components/crew/FullCrewEditModal.tsx` and `src/components/crew/ImportCrewCSVModal.tsx`. None of these paths exist: `src/components/crew/` is gone entirely, and the same-named files now live under `src/modules/crew/components/` (confirmed by `find`). The whole document predates the `src/modules/<name>` reorganization that the current 34-module architecture is built on (per SITE_MAP.md), and its "1/1 tests pass" baseline is meaningless against the current 61-file, 759-test suite.
Impact: A future reader or agent trying to locate "documented issues to review" at the paths this report cites will find nothing there, and may either give up on a real (if stale) lead or, worse, edit the wrong file at a coincidentally similar path elsewhere in the tree.
Suggested fix: Either delete/archive AUDIT-REPORT.md as superseded by docs/SYSTEM-AUDIT-2026-09-19.md, or add a banner noting it reflects the pre-modules codebase structure and should not be used to locate current files.

### [DOCS] — SITE_MAP.md and AUDIT_CONFIG.md both state `profiles.role` has 7 values; the enum has 6
Severity: Medium
Location: SITE_MAP.md:222 ("1. `profiles.role` (7 values)"); AUDIT_CONFIG.md:8 ("profiles.role (7 values)"); actual definition: supabase/migrations/20260125143210_72ec62e6-2afe-42e8-9ebf-d871d1dc44f7.sql:2
Description: The live migration defines `CREATE TYPE public.user_role AS ENUM ('master', 'chief_engineer', 'chief_officer', 'crew', 'dpa', 'shore_management');` — six values. No later migration runs `ALTER TYPE ... ADD VALUE` on it, and `src/integrations/supabase/types.ts` (both the `Enums` object and the `Constants.public.Enums.user_role` array) list exactly the same six literals. Both of this audit's own top-level ground-truth documents — SITE_MAP.md (this audit's Phase 1 output, meant to be relied on by every later phase) and AUDIT_CONFIG.md (the audit's own input configuration) — assert 7. This is the same class of bug the audit's own config file warns against (the corrected "3 RBAC systems → 4" example), just with the count now wrong in the other direction.
Impact: Phase 3 synthesis, or any other Phase 2 sub-agent, that copies "profiles.role (7 values)" forward as verified ground truth will misstate the legacy role model in the final report, and a reader trying to enumerate the 7th value will not find one.
Suggested fix: Correct both documents to "profiles.role (6 values: master, chief_engineer, chief_officer, crew, dpa, shore_management)."

### [DOCS] — No CLAUDE.md or AGENTS.md exists anywhere in the repo
Severity: Low
Location: repo root and all subdirectories (checked via `find . -iname 'CLAUDE.md' -o -iname 'AGENTS.md'`, no matches)
Description: There is no contributor-instructions file for AI coding agents at any level. `package.json` scripts (`dev`, `build`, `lint`, `test`, `typecheck`, `check`) are correctly referenced piecemeal across README.md, MIGRATION-PLAN.md and docs/LOGBOOKS.md/HEALTH.md/HRIS.md, but there is no single canonical entry point stating build/test/lint conventions, which is what this checklist item was checking for consistency against.
Impact: Not a drift risk today (nothing to be inconsistent with), but the many scattered per-module doc files (docs/HEALTH.md, docs/HRIS.md, docs/LEGAL.md, docs/LOGBOOKS.md, six root-level audit/report files) with no index is itself already flagged in docs/SYSTEM-AUDIT-2026-09-19.md ("Documentation lives in six unlinked root-level Markdown files plus `docs/`") — a CLAUDE.md would be a natural place to link them and state which are current vs. superseded.
Suggested fix: Not required by this checklist item to fix; flagging only as confirmed-absent per the audit instructions. If the team wants one, it should explicitly mark docs/SYSTEM-AUDIT-2026-09-19.md as the current source of truth and flag AUDIT-REPORT.md / docs/STORM-STATUS-AUDIT.md as historical/superseded (see the two findings above).

### [DOCS] — Legal module docs (docs/LEGAL.md, src/modules/legal/MIGRATION-NOTES.md) verified accurate — no drift found
Severity: Cosmetic
Location: docs/LEGAL.md; src/modules/legal/MIGRATION-NOTES.md; supabase/migrations/20260919120000_legal_module.sql
Description: Spot-checked against the single migration that created this module (no later migration touches `legal_*` tables): all six table names (`legal_requests`, `legal_request_comments`, `legal_document_templates`, `legal_document_versions`, `legal_form_submissions`, `legal_request_events`), all documented RPC/function names (`legal_can_edit`, `legal_can_admin`, `legal_sla_deadline`, `legal_generate_alerts`, `legal_search_documents`, `legal_team_directory`, `legal_attachments_valid`, `legal_attachment_path_allowed`, `legal_request_visible`, `legal_template_company`, `legal_request_type_label`), the status vocabulary (`submitted/triaged/in_progress/under_review/completed/cancelled`), and the cron schedule (`'15 * * * *'` hourly) all match the migration file exactly.
Impact: None — recorded as a positive control confirming the docs-vs-code checking method was applied, not just assumed clean.
Suggested fix: None needed.

### [DOCS] — docs/HRIS.md's HR/payroll access-model tables verified accurate — no drift found
Severity: Cosmetic
Location: docs/HRIS.md:34-35; src/modules/auth/lib/hrAccess.ts:26-28
Description: The documented RBAC tiers (admin = superadmin/dpa; edit = fleet_master/captain/purser; view = chief_officer/chief_engineer/hod; legacy admin = dpa/shore_management; legacy edit = master; legacy view = chief_officer/chief_engineer) match `RBAC_ADMIN_ROLES`/`RBAC_EDIT_ROLES`/`RBAC_VIEW_ROLES`/`LEGACY_*` constants in `hrAccess.ts` verbatim.
Impact: None — positive control.
Suggested fix: None needed.

### [DOCS/ENV] — .env.example and client-side Vite env vars fully consistent — no drift found
Severity: Cosmetic
Location: .env.example; grep of `import.meta.env.*` across src/
Description: Beyond the 13 undocumented edge-function secrets already flagged in phase1-deps-env-roles.md, the client-side surface is clean: the only three `import.meta.env.VITE_*` references in `src/` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_VERSION`) are exactly the three variables declared in `.env.example`, with no undocumented-but-used or documented-but-unused vars on the client side. This corroborates phase1's own "Frontend env vars fully and correctly documented" finding independently.
Impact: None — positive control confirming item 5 of the checklist, extended past edge functions.
Suggested fix: None needed.

---

## Summary of method

- Read SITE_MAP.md and .audit-staging/phase1-deps-env-roles.md first per instructions; did not re-derive the 13-secret list.
- Full read of docs/SYSTEM-AUDIT-2026-09-19.md, docs/LEGAL.md, src/modules/legal/MIGRATION-NOTES.md, MIGRATION-PLAN.md, README.md, AUDIT_CONFIG.md, roadmap.md, docs/HEALTH.md, docs/HRIS.md, docs/LOGBOOKS.md, docs/STORM-STATUS-AUDIT.md (partial), AUDIT-REPORT.md (partial), DEMO-SCRIPT.md (partial), HRIS-AUDIT.md (targeted grep).
- `find . -iname 'MIGRATION*'` (per instructions) returned MIGRATION-PLAN.md, src/modules/legal/MIGRATION-NOTES.md and the `supabase/migrations` directory — no other MIGRATION-PLAN/NOTES files exist.
- `find . -iname 'CLAUDE.md' -o -iname 'AGENTS.md'` returned nothing anywhere in the repo.
- Verified specific factual claims against the actual migration SQL, `src/integrations/supabase/types.ts`, `package.json`, `.github/workflows/ci.yml`, and by running `npm run lint` live.
- Used `git log` on MIGRATION-PLAN.md and docs/SYSTEM-AUDIT-2026-09-19.md to establish the timeline that produced the two "stale Critical finding" items above.
- No files were modified except this report.
