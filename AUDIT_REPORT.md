# STORM Platform Audit — Phase 3: Compiled Findings Report

Compiled 2026-09-21 from four Phase 1 discovery passes and nine Phase 2 specialist audits (13 sub-agents total, all read-only). Source reports are preserved verbatim under `.audit-staging/phase{1,2}-*.md`; this document synthesizes, cross-references, de-duplicates, and — in one case — corrects them. `SITE_MAP.md` is the companion ground-truth factual inventory.

## How to read this report

Findings are numbered **C** (Critical), **H** (High), **M** (Medium), **L** (Low/Cosmetic), each tagged with the source report(s). Criticals and Highs carry full description/impact/fix; Mediums are summarized with a pointer to the source file for full detail; Lows are tabulated. A **Corrections** section documents two cases where this audit caught its own false or stale claims — surfaced deliberately, per the same "don't trust stale premises" principle the audit itself was applying to the codebase's own docs.

## Executive summary

| Severity | Count | Theme breakdown |
|---|---|---|
| Critical | 15 (1 retracted — see Corrections) | Cross-tenant data exposure (2), RBAC/route-gating (3), compliance-workflow bypass (4), dead/no-op security controls (4), non-functional module (1), UX-breaking (1) |
| High | 19 | Auth/authz (3), data integrity (4), UI/UX & feedback (4), accessibility (4), performance (1), dead code (1), docs drift (2) |
| Medium | ~30 | See per-section tables |
| Low/Cosmetic | ~35 | See per-section tables |

**The single biggest theme across all 13 reports**: this codebase repeatedly builds a real, server-side, role-gated enforcement mechanism (an edge function, a trigger, an RPC) for a sensitive workflow — and then the actual UI never calls it, instead writing the same table directly with no equivalent guard. This exact shape recurs **five separate times**, independently discovered by five different agents: ISM form signing (already fixed, prior work), certificate DPA-approval (`review-certificate`, C-6 below), drill completion (`complete-drill`, C-7), CAPA/incident closure (no edge function ever existed — H-4), and admin PIN step-up (`verify_pin`, C-3). This is the pattern Phase 4 should treat as a category, not five unrelated bugs.

The second theme: **tenant isolation is inconsistently applied**, with two genuinely open cross-tenant holes (`crew_import`, `incident-attachments`/`crew-travel-documents`) and one that looked like a third but was already fixed (New Build `nb_*` — see Corrections).

---

## Critical findings

### C-1. Cross-tenant PII leak via `crew_import`
*Source: phase1-db-rls*
`crew_import` has no `company_id` column and a `FOR SELECT TO authenticated USING (true)` policy. Any authenticated user of any tenant company can read every other tenant's imported crew data — full legal name, DOB, nationality, personal/work contact, next-of-kin.
**Fix**: add `company_id`, backfill from linked vessel/import batch, replace policy with a company-scoped `USING`.

### C-2. Incident and crew-travel-document storage: no tenant scoping, no file-type/size limits
*Source: phase2-forms-validation*
The `incident-attachments` bucket was created with no `file_size_limit`/`allowed_mime_types` and a policy scoped only to `auth.role() = 'authenticated'` — **no company check at all** (contrast the correctly-scoped `documents` bucket). Any tenant can read every other tenant's incident-evidence photos/documents. `crew-travel-documents` has the same missing MIME/size enforcement (its tenant scoping was fixed in a June migration, but type/size never was), and its own upload page sets no client-side size cap either.
**Fix**: add `file_size_limit`/`allowed_mime_types` to both buckets; rewrite `incident-attachments`'s policy to scope by company via `incidents.company_id`, following the `legal-attachments` pattern (`legal_attachment_path_allowed()`).

### C-3. Admin-action PIN "step-up" confirmation is never checked server-side
*Source: phase2-auth-security*
`admin-actions`'s `reset_account`, `toggle_access`, and `reallocate_vessel` only check the caller's JWT + role. The 10-minute "PIN confirmed" window exists only in browser `sessionStorage`; the edge function never reads `admin_pins.last_confirmed_at`. Any `dpa`/`superadmin` session token can force a password reset, disable/re-enable any account, or reassign any crew member to any vessel — with zero PIN ever entered — via a direct HTTP call.
**Fix**: check `admin_pins.last_confirmed_at` server-side before executing any of the three actions, or issue a short-lived server-signed confirmation token from `verify_pin` and require it on every subsequent privileged call.

### C-4. Dark mode never applies on page load
*Source: phase2-ui-ux*
`applyTheme()` is only ever called from Settings → Appearance's Save handler. There is no `ThemeProvider`, no boot-time effect, no `prefers-color-scheme` check anywhere. Every fresh load/refresh renders in light mode regardless of saved preference — for a platform whose explicit design intent is dark-mode-first, dark mode is non-functional as shipped, not merely inconsistent.
**Fix**: add a boot-time effect (or adopt `next-themes`) that applies the saved/localStorage theme before first paint.

### C-5. Crew member can reverse their own deactivation
*Source: phase2-workflow-logic*
The original, never-revoked `"Users can update their own profile"` RLS policy has no `WITH CHECK`. A later trigger (`profiles_guard_privileged_columns`) blocks self-edits to `role`/`account_status`/`company_id` but was never extended to `status`/`employment_status` — the exact fields `deactivateCrew` sets. A deactivated crew member's own session can call `.update({status:'Active'})` on themselves and reappear as active everywhere `profiles.status` is read, with no `CHECK` constraint stopping garbage values either.
**Fix**: add `status`/`employment_status` to the guarded-column trigger; add `CHECK (status IN (...))`.

### C-6. Certificate DPA-approval is fully bypassable
*Source: phase2-workflow-logic*
`review-certificate` correctly enforces DPA-only approval server-side — but is never called from the client (0 references in `src/`). The real UI path (`useCertificates.ts`'s `updateCertificate`/`renewCertificate`) writes `certificates.status` directly; the RLS `UPDATE` policy checks only company membership, and `status` has no `CHECK`. Any company member can approve, renew, or supersede any certificate.
**Fix**: route the client through `review-certificate`, or add a `WITH CHECK` requiring DPA role for status transitions into `Valid`/`Superseded`/`Rejected`, plus a vocabulary `CHECK`.

### C-7. Drill completion and audit/CAPA-finding status: same bypass pattern
*Source: phase2-workflow-logic*
`complete-drill` role-gates completion (dpa/master/shore_management) and atomically records evidence — but is unused; the generic `updateDrillMutation` lets any company member set `status: 'Completed'` with zero evidence captured, and auto-CAPA-on-deficiency never fires. `audits.status`, `audit_findings.status`, `management_reviews.status` share the identical shape: free-text, no `CHECK`, company-membership-only `UPDATE` policy — an audit finding can jump straight from Open to Closed with no CAPA and no review.
**Fix**: wire the drill-completion UI to `complete-drill`; add vocabulary `CHECK`s and role-scoped `WITH CHECK`/triggers to all four tables.

### C-8. Incident/CAPA closure is entirely client-enforced; self-verification is possible
*Source: phase2-workflow-logic*
`incidents`/`corrective_actions` UPDATE RLS is company-membership-only, no role gate, no `WITH CHECK`. `useVerifyCAPAction` sets `verified_by` to whoever calls it — nothing stops the person who performed the corrective action from also verifying and closing it, or any company member from closing an incident whose investigation was never started.
**Fix**: add a trigger requiring an incidents/DPA role for status/`verified_by` changes, rejecting `Closed` unless `verified_by ≠ assigned_to` and (for incidents) `investigation_status = 'Completed'` when required.

### C-9. `send-email` is a fully unauthenticated phishing-capable relay
*Source: phase1-db-rls, phase1-edge-functions-api*
No auth check of any kind. Accepts `{to, cc, from, template, variables}` from any internet caller and sends via the company's real Resend account/domain — `from` and template variables (including `PASSWORD_RESET`/`ALERT_ESCALATION` action links) are fully attacker-controlled.
**Fix**: require a caller JWT or internal shared secret; never let the caller set `from`; rate-limit.

### C-10. `sign-submission`'s PIN-based e-signature check is a complete no-op
*Source: phase1-edge-functions-api*
For `signatureMethod === 'PIN'`, the code checks only that `signature_pin_hash` exists — it never compares the submitted PIN. Any required signer can "PIN-sign" an ISM/SMS submission with any or no PIN, undermining the compliance signature trail.
**Fix**: reuse `admin-actions`' working `hashPin`/`verifyPin` pair and actually check `body.pin`.

### C-11. `inbound-webhook`: dead HMAC-verification code, plaintext-compared shared secret
*Source: phase1-edge-functions-api*
An `x-webhook-signature` header is read and `crypto` imported but never used again anywhere in the file. Real auth is `.eq('webhook_secret', webhookSecret)` against a plaintext column, with no rate limiting on guesses.
**Fix**: hash `webhook_secret` at rest; actually verify the HMAC signature; rate-limit.

### C-12. Refit module: 30 `rf_*` tables referenced, none exist in any migration
*Source: phase1-edge-functions-api, phase1-routes-deadcode*
`src/modules/refit/lib/db.ts` casts the Supabase client to `any` specifically to hide this from `tsc`. The module compiles clean but every data call 42P01s at runtime — dashboard, change orders, purchase orders, invoices, audit log, everything.
**Fix**: locate/restore the missing migrations or clearly flag the module as unshipped; remove the `as any` cast once real tables exist.

### C-13. Refit sidebar sub-tree wired to double-suffixed paths; 32 built pages unreachable
*Source: phase1-routes-deadcode*
`sitemap.ts`'s `L()` helper is called with an already-suffixed base for every Refit leaf, producing paths like `/yard/refit/overview/dashboard/dashboard` instead of the real `/yard/refit/overview/dashboard`. Because these leaves carry no `existing:` override, they're silently treated as legitimate "Coming Soon" placeholders and the existing regression test doesn't catch it. Every Refit nav click lands on a placeholder for a feature that's already built (module-existence caveat: per C-12, the underlying tables don't exist either, so fixing routing alone does not make Refit functional).
**Fix**: pass the group base only (not the pre-suffixed path) in each `yardRefit` leaf; extend `sitemapTargets.test.ts` to catch shadowed-but-misspelled placeholders.

### C-14. RBAC: route-level authorization applied to only 2 of ~34 modules
*Source: phase1-deps-env-roles*
`ProtectedRoute` is login-only. `ModuleRoute` (the only component that calls `canAccessModule()` + level resolvors) wraps only HRIS and Health routes. Every other module — including Settings → Roles & Permissions, Users & Access, and Refit/New Build's now-reachable financial pages — has zero route-level role check; sidebar visibility is the only thing hidden, not the page itself.
**Fix**: wrap every currently-bare `ProtectedRoute` module in `ModuleRoute moduleId="..."` (the `moduleKeyMap` needed already exists in `AuthContext.tsx`).

### C-15. Postgres's real root of trust is decoupled from the RBAC tables the admin UI manages
*Source: phase1-deps-env-roles*
`has_role()`/`user_roles` (14-value `app_role` enum) gates every RLS write-policy on the RBAC tables and `admin-actions` — but the in-app "Roles & Permissions"/"Users & Access" screens manage a completely different table (`rbac_user_roles`). Granting a role via the UI does not grant `has_role()`; `user_roles` has essentially only bootstrap accounts in it while the app-visible system has hundreds of live grants.
**Fix**: per the prior audit's recommendation, collapse to one root of trust — either retire `user_roles`/`has_role()` in favor of `rbac_user_roles`, or migrate everything to check the latter.

---

## Corrections (findings investigated and closed during compilation)

### RETRACTED-1. New Build `nb_*` tables: NOT an open cross-tenant hole
Originally reported by phase2-forms-validation as Critical (43 tables with `USING(true) WITH CHECK(true)` RLS). **Verified false during Phase 3 compilation**: migration `20260919170000_nb_company_scope.sql` — dated the same day, sitting chronologically *between* the two migrations that finding itself cites — already drops every permissive policy and replaces it with company-scoped RLS plus a `BEFORE INSERT` trigger that fills `company_id` server-side. This migration is present on `main` (predates this audit entirely) and was applied to the live project as earlier remediation work. See `.audit-staging/phase2-forms-validation.md` for the full correction trail. **Do not carry this forward as a live issue.**

### RETRACTED-2. `docs/SYSTEM-AUDIT-2026-09-19.md`'s "CI has never passed" and "leaked token" findings are stale
*Source: phase2-docs-consistency*. Both were fixed same-day by commit `9cc26fd`, 42 minutes after the audit doc was first written; the doc itself was edited again later that day for unrelated findings but never updated for these two. Confirmed live: `npm run lint` → 0 errors; `MIGRATION-PLAN.md:56` is redacted. Not an open item — flagged here only so Phase 4 doesn't rediscover it as new work.

### RETRACTED-3. This audit's own `SITE_MAP.md`/`AUDIT_CONFIG.md` overstated `profiles.role`'s cardinality
*Source: phase2-docs-consistency*. Stated 7 values; the enum has 6 (`master`, `chief_engineer`, `chief_officer`, `crew`, `dpa`, `shore_management`). Already corrected in both files during this compilation.

---

## High findings

### H-1. User enumeration on login and registration
*phase2-auth-security* — `Auth.tsx` shows materially different messages for "Invalid login credentials" vs. "Email not confirmed," and surfaces raw Supabase signup errors verbatim, reliably revealing whether an email is registered. **Fix**: one generic message for all login failures.

### H-2. Self-registration is dead/broken since the Sept-19 signup lockdown, creates orphaned auth users
*phase2-auth-security* — the RLS lockdown correctly closed self-serve company/profile creation, but `Auth.tsx`'s register tab and `AuthContext.signUp()` were never updated: `auth.signUp()` always succeeds first, then the company/profile inserts always fail under RLS, leaving a real orphaned Supabase Auth user every attempt. **Fix**: remove/disable the register tab (invitation-only is already the stated model) or rebuild it server-side.

### H-3. Health & Wellness: 49-53 tables built by migration, absent from generated `types.ts`
*phase1-db-rls, phase1-edge-functions-api* — ambiguous whether migrations were never applied live or `types.ts` was never regenerated; directly explains the ~2,925 pre-existing typecheck errors in `src/modules/health/**` found during PR #31's CI work. **Fix**: confirm against live DB which case is true; regenerate types or apply migrations accordingly.

### H-4. Crew termination has no server-side cascade; three unsynced status columns
*phase2-workflow-logic* — `profiles.status`/`employment_status`/`account_status` are three independent columns from three migrations, never kept in sync. `deactivateCrew` only touches `status`; payroll, certificates, work-rest tracking, and login access are all left as if the person is still active. **Fix**: one authoritative lifecycle RPC that atomically updates all three plus dependent records.

### H-5. `extract-flight-data`/`extract-form-fields`: unauthenticated PII disclosure + open SSRF
*phase1-edge-functions-api* — no auth check on either; the first downloads via service-role key from a private bucket with no ownership check, the second `fetch()`es any attacker-supplied `file_url` with no host allow-list. **Fix**: require caller JWT + ownership check; add a host allow-list.

### H-6. Client calls a non-existent `next_reference` RPC at 3 refit call sites
*phase1-edge-functions-api* — wrong name/signature vs. the real `next_reference_value`; every call site has a silent fallback to a non-unique timestamp fragment, which is why it's gone unnoticed. **Fix**: create the missing function or repoint the call sites.

### H-7. `/insurance` and several Documents/Certificates sub-pages are completely unreachable
*phase1-routes-deadcode* — a real, 353-line built page with zero nav path in; several Documents/Certificates routes wired only to already-dead placeholder files. **Fix**: add `existing:` sitemap overrides.

### H-8. No real 404 page is ever shown
*phase1-routes-deadcode* — a complete, on-brand `NotFound` component exists and is imported but never rendered; the catch-all silently `Navigate`s to `/dashboard` instead. **Fix**: render `NotFound` from the catch-all route.

### H-9. Certificate renewal is three unguarded writes, not a transaction
*phase2-data-api* — two of the four sequential calls in `renewCertificate` discard their `{error}` result entirely; a mid-sequence failure leaves duplicate-active or zero-active certificates with the UI still reporting success. **Fix**: wrap in one SECURITY DEFINER function.

### H-10. Documents module still generates document numbers via client-side count+1
*phase2-data-api* — the exact race-prone pattern already fixed for audits/drills/findings, never migrated for Documents; no unique constraint either, so a collision isn't even rejected. **Fix**: add a `documents_set_number()` trigger following the existing `next_reference_value` pattern.

### H-11. Query errors are invisible in ~30 of 34 modules
*phase2-ui-ux* — only HRIS/Health check `isError`; no global `onError` on the `QueryClient`. A failed fetch (network drop, RLS denial) renders identically to "no data" — materially misleading in a safety/compliance context (incidents, audits, drills). **Fix**: add a third `isError` branch or a global `queryCache.onError` toast.

### H-12. RBAC department-scope save has zero user feedback on failure
*phase2-ui-ux* — the one mutation on `UsersAccessDetailPage` with no `onError` of the four on that page; a failed access-control change looks identical to a successful one. **Fix**: add the same `onSuccess`/`onError` toast pair the other three handlers use.

### H-13. Logbooks: 3 of 4 mutation hook files have zero toast feedback
*phase2-ui-ux* — official ship's logbooks (compliance recordkeeping); a failed entry save/sign-off gives no indication anything went wrong. **Fix**: add matching toasts, prioritizing save/sign-off/submit actions.

### H-14. Status/type badge colors hardcoded to the light Tailwind palette, no dark variant
*phase2-ui-ux* — 35 files, only 2 pair a `dark:` variant. Compounds C-4: once dark mode actually applies, these render as light pastel pills on a dark background. **Fix**: migrate to the existing semantic tokens (`bg-success/20 text-success`, etc.).

### H-15. Duplicate `<h1>` on 135 of 257 pages
*phase2-accessibility* — the shared shell always renders an `<h1>` page title; 53% of pages also render their own. Screen-reader heading navigation is broken on the majority of routes. **Fix**: remove the page-local `<h1>` from all 135 files.

### H-16. 67% of icon-only buttons (185 of 274) have no accessible name
*phase2-accessibility* — the single most widespread a11y gap by raw count; includes view/edit/renew certificate icons and month-navigation controls. **Fix**: add `aria-label` to every icon-only `Button`; consider an ESLint rule to prevent regression.

### H-17. Color-token palette fails WCAG AA contrast, used 574 times across 223 files
*phase2-accessibility* — computed directly from `index.css` HSL values; nearly every status/accent color against white fails 4.5:1 (several badly), and the "tinted badge" pattern is worse across the board. **Fix**: darken base tones or use the existing high-contrast `-foreground` pair for actual text; add an automated contrast linter to CI.

### H-18. Two hand-rolled modals bypass Radix Dialog, losing focus trap/Escape/restoration
*phase2-accessibility* — Refit's `Drawer` component (6 files) and a Crew Training side panel; no `role="dialog"`, no focus trap, no Escape handling. **Fix**: replace with the app's existing `Dialog`/`Sheet` primitives.

### H-19. `AuthContext` provider value not memoized — 228 consumers re-render on every provider re-render
*phase2-performance* — `signIn`/`signUp`/`signOut`/`resetPassword` aren't even `useCallback`'d; the context value is a fresh object every render. **Fix**: `useMemo` the value, `useCallback` the functions.

### H-20. Entire orphaned `src/lib/api/` data layer (~2,330 lines)
*phase2-dead-code* — a complete, superseded module-agnostic API hook layer with zero live importers; carries 2 of the repo's only 3 real TODO comments. **Fix**: delete the directory after a final confirmation nothing outside `src/` imports it.

### H-21. `docs/STORM-STATUS-AUDIT.md` calls Work & Rest "Production-ready"; it's confirmed non-functional
*phase2-docs-consistency* — contradicts this audit's own `SITE_MAP.md` and the prior `SYSTEM-AUDIT-2026-09-19.md`, which the doc itself doesn't cross-reference. **Fix**: add a superseded-by note or strike the claim.

---

## Medium findings (summarized — full detail in source reports)

| # | Finding | Source |
|---|---|---|
| M-1 | Two role vocabularies (`app_role` enum vs. `roles` table) have diverged; `superadmin`/`travel_agent` unassignable via UI | phase1-deps-env-roles |
| M-2 | `user_permission_overrides` deny capability is dead code on read and write side | phase1-deps-env-roles |
| M-3 | Second, fully-unused parallel permission engine (`PermissionGate.tsx`) | phase1-deps-env-roles |
| M-4 | Ported modules (refit, logbooks, ISM forms) query `user_roles` with role vocabularies that don't exist in the real enum | phase1-deps-env-roles |
| M-5 | `pt-exercise-import` missing from `config.toml` entirely (config drift) | phase1-edge-functions-api |
| M-6 | `submit-form` has no role/tenant check before inserting | phase1-edge-functions-api |
| M-7 | `ai-route-planner` has no auth check (unmetered LLM-cost exposure) | phase1-edge-functions-api |
| M-8 | `hr-daily-sweeper`/`ais-refresh`/`idea-sync`: non-constant-time secret compare; leaked `SYSTEM_API_KEY` bypasses company scoping | phase1-edge-functions-api |
| M-9 | Several Documents/Certificates sub-pages, admin nav items unreachable (`ADMIN_NAV_ITEMS` dead) | phase1-routes-deadcode |
| M-10 | Refit/New Build carry no module-level RBAC gate, unlike HRIS/Health/Legal | phase1-routes-deadcode |
| M-11 | Invitation/bulk-invite authorize on legacy `profiles.role`, not the RBAC root of trust | phase2-auth-security |
| M-12 | No application-level login rate limiting/lockout | phase2-auth-security |
| M-13 | Orphaned invitation-acceptance mechanism (`accept-invitation`) still live, unauthenticated, currently inert | phase2-auth-security |
| M-14 | Drag-to-reschedule on itinerary Planning Grid fails completely silently | phase2-data-api |
| M-15 | Document detail cache (`['document', id]`) never invalidated by workflow mutations | phase2-data-api |
| M-16 | No pagination on crew/incidents/notifications lists; notification center polls unbounded query every 30s | phase2-data-api |
| M-17 | Sequential single-row insert loops (client N+1) with misleading "all succeeded" toasts | phase2-data-api |
| M-18 | Document approval workflow re-implements status transitions entirely client-side (same shape as C-6/C-7/C-8) | phase2-data-api |
| M-19 | `crew_contracts` termination role-gated but not transition-guarded (can skip/reverse states) | phase2-workflow-logic |
| M-20 | ISM Form Template Builder: no per-step validation; empty/malformed templates can publish | phase2-forms-validation |
| M-21 | ISM "Upload Source Document" fails silently due to a client/RLS path mismatch | phase2-forms-validation |
| M-22 | Leave-request date-range validation exists in admin path, missing from crew self-service path | phase2-forms-validation |
| M-23 | Destructive-delete confirmation split between shared `AlertDialog` and native `window.confirm()` (10 sites) | phase2-ui-ux |
| M-24 | Rotation Planner deletes fire immediately with no confirmation (keyboard shortcut included) | phase2-ui-ux |
| M-25 | ~20% of sampled real pages have zero responsive breakpoint classes | phase2-ui-ux |
| M-26 | Sitemap "placeholder" classification inaccurate for Health/HRIS/New Build — real content, fragile route-order coincidence, not a content gap; **Vessel (120/151) and Shoreside (8/8) are the genuine unbuilt sections** | phase2-ui-ux |
| M-27 | Search/filter inputs (88 of 99) rely on placeholder text alone, no label | phase2-accessibility |
| M-28 | Clickable `Card` components used as buttons/nav with no keyboard access (8 sites) | phase2-accessibility |
| M-29 | No "skip to main content" link anywhere in the app shell | phase2-accessibility |
| M-30 | `VesselContext` provider value also unmemoized — 43 consumers | phase2-performance |
| M-31 | List/table rows not memoized (`DocumentTable`, `CrewList`) — full-list re-render on unrelated state change | phase2-performance |
| M-32 | Dashboard `MaintenanceWidgets` recomputes filter/sort over full fleet arrays every render, unlike its memoized sibling | phase2-performance |
| M-33 | Duplicate/near-duplicate `useCorrectiveActions` hooks, one dead, easily confused names | phase2-dead-code |
| M-34 | Shared branded-PDF hook `usePDFExport` entirely unused; 4 modules bypass it with ad-hoc `jsPDF`, breaking brand consistency | phase2-dead-code |
| M-35 | Four independent, inconsistent currency formatters (different default currencies, minor/major unit assumptions) | phase2-dead-code |
| M-36 | Duplicate CSV-export logic; Crew Roster and Roles & Permissions audit-log exports don't escape embedded quotes/commas (silent corruption) | phase2-dead-code |
| M-37 | Phantom dependency `html2canvas` referenced in build config but never declared in `package.json` | phase2-dead-code |
| M-38 | `xlsx` pinned to a version with known unpatched npm CVEs, used on untrusted spreadsheet uploads | phase1-deps-env-roles |
| M-39 | 13 edge-function secrets exist with no example/manifest file anywhere | phase1-deps-env-roles |
| M-40 | Untracked data-migration script at repo root (`supabase_domain_migration.sql`), no audit trail | phase1-db-rls |
| M-41 | Undocumented out-of-band table `dev_todos`, no migration history | phase1-db-rls |
| M-42 | `AUDIT-REPORT.md`'s file paths no longer exist (predates `modules/` restructuring) | phase2-docs-consistency |

## Low / Cosmetic findings (tabulated)

| # | Finding | Source |
|---|---|---|
| L-1 | Two unused Leaflet wrapper packages (`react-leaflet`, `@react-leaflet/core`) | phase1-deps-env-roles |
| L-2 | Several packages a major version behind (non-urgent) | phase1-deps-env-roles |
| L-3 | Inconsistently-named secret `Deno.env.get("Airtable")` | phase1-deps-env-roles |
| L-4 | `canAccessModule` fails open for non-sensitive modules while RBAC is loading | phase2-auth-security |
| L-5 | Admin PIN comparison not constant-time (mitigated by lockout) | phase2-auth-security |
| L-6 | Cosmetic hardcoded-looking API key in a mock settings screen | phase2-auth-security |
| L-7 | `acknowledgeAlert` mutation has no error handling | phase2-data-api |
| L-8 | `staleTime` overrides ad hoc per hook, no shared tiers | phase2-data-api |
| L-9 | Validation-library adoption inconsistent — only 2 of 34 modules use react-hook-form+zod | phase2-forms-validation |
| L-10 | Leaflet map popups use a hardcoded color scheme independent of app theme | phase2-ui-ux |
| L-11 | Heading hierarchy skips h1→h3 (588 `CardTitle` vs. 110 `<h2>`) | phase2-accessibility |
| L-12 | ISM form-builder table field type has unlabeled grid cells | phase2-accessibility |
| L-13 | One `Dialog` missing `DialogTitle` | phase2-accessibility |
| L-14 | Dark-mode sidebar border at 1.28:1 contrast (needs visual verification) | phase2-accessibility |
| L-15 | 35% of `.select()` calls fetch every column on wide tables for list views | phase2-performance |
| L-16 | Roles & Permissions matrix recomputes module groupings without memoization | phase2-performance |
| L-17 | Unused devDependency `@tailwindcss/typography` | phase2-dead-code |
| L-18 | Redundant Excel libraries (`xlsx` + `exceljs`) doing overlapping work | phase2-dead-code |
| L-19 | ~200 exported query-key constants with zero external importers (cosmetic); ~15-20 genuinely dead functions among them | phase2-dead-code |
| L-20 | Duplicate date-formatting (`fmtDate`) reimplemented 3x | phase2-dead-code |
| L-21 | Duplicate email-validation regex (one copy already dead) | phase2-dead-code |
| L-22 | One live user-facing TODO: Documents "Edit" silently no-ops | phase2-dead-code |
| L-23 | Anonymous, unauthenticated geocoding proxy (`geocode-search`) — cost/abuse only, no data exposure | phase1-db-rls |
| L-24 | Two reference tables (`equipment_categories`, `ports`) missing `TO authenticated` | phase1-db-rls |
| L-25 | Duplicate migration timestamp (two unrelated files share one prefix) | phase1-db-rls |
| L-26 | Dead legacy RBAC tables retained (`roles_legacy_v1` etc.) — cosmetic, not a gap | phase1-db-rls |
| L-27 | No CLAUDE.md/AGENTS.md exists anywhere in the repo | phase2-docs-consistency |

---

## Positive findings worth preserving (not defects — noted so remediation doesn't regress them)

- All 145 unique `SECURITY DEFINER` functions correctly pin `search_path` — no exceptions found.
- Route-level code splitting (`React.lazy`) is applied consistently across all 5 module route files and the main router; only 3 deliberate eager imports (auth/dashboard critical path).
- `lucide-react`'s 580 import sites are all correctly tree-shaken named imports.
- Legal module's Markdown renderer is a safe, hand-rolled AST-to-React renderer with scheme-whitelisted links — no HTML-injection surface.
- `DashboardLayout`'s mobile navigation drawer has genuinely solid focus management (trap, restoration, Escape) and its own regression test — the right reference implementation for the two broken modals in H-18.
- Legal request lifecycle (triggers, RLS, status vocabulary) is correctly, fully server-enforced — the reference implementation the certificate/drill/incident fixes in C-6/C-7/C-8 should copy.
- `crew_contracts`/`avatars` bucket are textbook client+server validation parity — the reference pattern for closing the gaps in M-20/C-2.
- HRIS's `hrAccess.ts` role-tier documentation in `docs/HRIS.md` is accurate — no drift.
- Client-side `.env.example` and Vite env var usage are fully consistent, no drift.

---

## Source reports index

| Report | Agent focus |
|---|---|
| `.audit-staging/phase1-deps-env-roles.md` | Dependencies, env vars, RBAC matrix |
| `.audit-staging/phase1-db-rls.md` | DB schema & RLS |
| `.audit-staging/phase1-edge-functions-api.md` | Edge functions & API surface |
| `.audit-staging/phase1-routes-deadcode.md` | Routes, pages, dead components |
| `.audit-staging/phase2-auth-security.md` | Auth/session security deep dive |
| `.audit-staging/phase2-ui-ux.md` | UI/UX consistency |
| `.audit-staging/phase2-data-api.md` | Data/API layer (TanStack Query, mutations) |
| `.audit-staging/phase2-workflow-logic.md` | Cross-module workflow/business-logic correctness |
| `.audit-staging/phase2-forms-validation.md` | Forms & validation |
| `.audit-staging/phase2-accessibility.md` | Accessibility (a11y) |
| `.audit-staging/phase2-performance.md` | Performance |
| `.audit-staging/phase2-dead-code.md` | Broader dead-code cleanup |
| `.audit-staging/phase2-docs-consistency.md` | Documentation consistency |

## Next step

Phase 4: build `ACTION_PLAN.md`, sequencing all Critical/High/Medium findings by dependency then severity (e.g. C-14/C-15's RBAC root-of-trust decision gates several other fixes; the five-instance "role-gated edge function exists but UI bypasses it" pattern should be fixed as one batch). Phase 5 (execution) is held for explicit user go-ahead given the scale.
