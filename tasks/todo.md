# STORM Security Remediation — Task Plan

## Completed

- [x] **CRITICAL** Remove exposed GitHub token from `package.json` repository URL
- [x] **HIGH** Add `.env` to `.gitignore`, remove from tracking, create `.env.example`
- [x] **HIGH** Fix auth race condition in `AuthContext.tsx` (duplicate session handling)
- [x] **MEDIUM** Fix `permissionsStore.ts` — add `isInitialized` guard to prevent redundant loads
- [x] **MEDIUM** Add env var validation in `src/integrations/supabase/client.ts`
- [x] **IMPORTANT** Implement domain-restricted auth for `@ink.fish` and `@krakenfleet.co`
- [x] All 284 tests passing, TypeScript compiles clean
- [x] Changes committed and pushed to `claude/storm-security-remediation-Alvcm`

## Still Required (Manual / Infrastructure)

- [ ] **CRITICAL** Revoke exposed GitHub token `ghp_g7x...` in GitHub Settings > Developer settings > Personal access tokens — this cannot be done via code, only by the token owner
- [ ] **CRITICAL** Rotate any systems that used this token for access — assume it is compromised
- [ ] **RECOMMENDED** Run `git filter-branch` or BFG Repo-Cleaner to scrub the token from git history (it persists in older commits even after removal from HEAD)
- [ ] **RECOMMENDED** Deploy Supabase migration for domain-based Row Level Security policies
- [ ] **RECOMMENDED** Set up Supabase auth email domain restrictions as a server-side backstop

## Review

**Changes made:** 8 files across security, auth, and config layers.
**Tests:** 284/284 passing. Zero TypeScript errors.
**Approach:** Minimal, targeted fixes. No unnecessary refactoring. Each change addresses a specific identified vulnerability or bug.
