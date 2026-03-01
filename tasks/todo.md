# STORM Full Repository Audit — Action Plan

## Completed (Session 1)
- [x] Remove exposed GitHub token from `package.json`
- [x] Add `.env` to `.gitignore`, remove from tracking
- [x] Fix auth race condition in `AuthContext.tsx`
- [x] Fix `permissionsStore.ts` isInitialized guard
- [x] Add env var validation in Supabase client
- [x] Implement domain-restricted auth for `@ink.fish` / `@krakenfleet.co`

---

## CRITICAL — Fix Immediately

### Security
- [ ] **Revoke exposed GitHub token** — manual action by Digby in GitHub Settings
- [ ] **Scrub git history** — BFG Repo-Cleaner to remove token + .env from old commits
- [ ] **Enable JWT verification on all edge functions** — `supabase/config.toml` has `verify_jwt = false` on all 25 functions. Only webhooks/geocode should be public.
- [ ] **Fix CORS on all edge functions** — every function uses `Access-Control-Allow-Origin: '*'`. Restrict to your actual domain(s).
- [ ] **XSS in email template preview** — `EmailTemplatesSection.tsx:292` uses `dangerouslySetInnerHTML` with user-controlled HTML. Add DOMPurify.
- [ ] **Fix default-allow logic in AuthContext** — line 184: `if (!allowedRoles) return true` means unknown modules are accessible to everyone. Should be `return false`.
- [ ] **Remove invitation token from API response** — `send-invitation/index.ts:117-118` returns the token in the response body. The comment admits this is wrong.

### Auth & Authorization
- [ ] **Admin actions lack server-side permission checks** — `useAdminActions.ts:102-215`: resetAccount, toggleAccess, reallocateVessel only check a client-side PIN with no server-side auth verification.
- [ ] **Role assignment is unvalidated** — `useUserRoles.ts:209-257`: no check that the assigner has admin rights, target user exists, or role is valid for scope.
- [ ] **Routes have no authorization checks** — `ProtectedRoute` only checks `if (!user)`. Admin routes (`/admin/*`), crew admin routes, ISM routes — all accessible to any authenticated user.

---

## HIGH — Fix This Sprint

### Backend
- [ ] **Service role key used without caller auth** in multiple functions: accept-invitation, bulk-invite, airtable-sync, ais-refresh, idea-sync, inbound-webhook — all bypass RLS.
- [ ] **No rate limiting on any edge function** — PIN verification, password resets, bulk operations, external API calls all unprotected.
- [ ] **Weak PIN hashing** — `admin-actions/index.ts:14-42`: PBKDF2 with 100k iterations on a 6-digit PIN (~1M possibilities). Use bcrypt, increase PIN length, add lockout.
- [ ] **Overly permissive RLS on destinations/attachments** — migration `20260214151530`: `USING (true)` on INSERT/SELECT means any authenticated user sees all companies' data.
- [ ] **`has_fleet_access()` is not company-scoped** — fleet admins can see all companies' development expenses.
- [ ] **Time-limited roles never expire at runtime** — `types.ts:19-20`: `is_time_limited` and `max_session_hours` defined but never enforced.

### Frontend
- [ ] **Fix jsPDF version** — `package.json:56` specifies `^4.0.0` but latest stable is 2.5.x. PDF export is broken.
- [ ] **feedbackStore uses `as any` to bypass types** — `feedbackStore.ts:6`: `supabase.from('feedback_submissions' as any)` — no type safety on CRUD.
- [ ] **Dashboard company isolation not enforced** — `dashboardStore.ts:137-170`: `companyId` from client state, never validated server-side.
- [ ] **SignUp has no rollback** — `AuthContext.tsx:248-293`: creates user → company → profile. If step 3 fails, orphaned records remain.

### TypeScript
- [ ] **Strict mode disabled** — `tsconfig.app.json:19-23`: `strict: false`, `noImplicitAny: false`, `noUnusedLocals: false`. Allows bugs to pass silently.

---

## MEDIUM — Plan & Address

### Security Hardening
- [ ] **Implement server-side session management for admin confirmations** — replace sessionStorage PIN tracking with HTTP-only cookies.
- [ ] **Add input validation to edge functions** — `parse-crew-csv/index.ts:49-91` has weak email regex, no length limits, no sanitization.
- [ ] **SQL injection risk in inbound-webhook** — lines 405/465 use `.or()` with string interpolation of user input.
- [ ] **External API key validation is O(n)** — `external-api/index.ts:30-65` loads ALL keys and bcrypt-compares each. No rate limiting, no audit logging.
- [ ] **Add missing DB indexes** — `crew_leave_entries.vessel_id`, `crew_leave_requests.crew_id`, `development_applications` reviewer IDs.
- [ ] **RLS policy inconsistency** — some policies check `app_role` enum AND `profiles.role` string. Pick one system.

### Frontend Quality
- [ ] **Add route-level permission checks** — use PermissionGate (already exists at `auth/components/PermissionGate.tsx`) on admin, crew-admin, ISM, and settings routes.
- [ ] **Remove console.log/console.error from production** — 30+ instances across auth, dashboard, certificates, and more.
- [ ] **Complete TODO items** — `useIncidentsApi.ts:250` (investigation records), `Documents.tsx:75` (edit modal with debug `console.log`).
- [ ] **Fix duplicate Suspense fallbacks** — routes/index.tsx has inline loading spinners instead of reusing `LazyLoader` component.
- [ ] **Remove hardcoded mock data** — `DPADashboard.tsx:80-81` (alert counts), `EmailTemplatesSection.tsx:24-88` (template data).

### Accessibility
- [ ] **Add aria-labels to icon buttons** — DPADashboard Bell/Settings/User buttons, all modal triggers.
- [ ] **Add `role="dialog"` and focus management** to modal components.
- [ ] **Add table header `scope` attributes** for screen readers.
- [ ] **Add keyboard navigation** to custom interactive elements.

---

## LOW — Backlog

- [ ] Replace legacy permission system in AuthContext (ROLE_PERMISSIONS + MODULE_ACCESS) with RBAC-only approach.
- [ ] Add field-level encryption for PII (passport numbers, medical data, emergency contacts).
- [ ] Clean up unused imports across codebase (enable `noUnusedLocals` in tsconfig).
- [ ] Add idempotency key TTL/cleanup in send-email function.
- [ ] Add ON DELETE CASCADE to foreign keys referencing auth.users.
- [ ] Wrap localStorage usage in encryption for sensitive operational data.
