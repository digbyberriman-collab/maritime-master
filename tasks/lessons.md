# Lessons Learned

## 2026-03-01 — Security / Credential Management
**Mistake:** GitHub PAT was embedded directly in `package.json` repository URL and committed to git history.
**Root Cause:** Token was used for private repo access during setup and never cleaned from the config.
**Rule:** Never embed credentials in package.json, configuration files, or any tracked file. Always use environment variables and .gitignore patterns. Audit package.json repository URLs on every security review.
**Verified:** Removed token from package.json, added .env to .gitignore, created .env.example template.

## 2026-03-01 — Auth / Race Conditions
**Mistake:** `onAuthStateChange` and `getSession()` both fired for the same initial session, causing duplicate profile fetches and inconsistent loading state.
**Root Cause:** Supabase emits an `INITIAL_SESSION` event from `onAuthStateChange` that races with the explicit `getSession()` call. The listener path also never called `setLoading(false)`.
**Rule:** When combining `onAuthStateChange` + `getSession()`, track whether the initial session has been handled with a flag. Skip `INITIAL_SESSION` events if `getSession()` already resolved. Ensure ALL code paths set loading to false.
**Verified:** Auth flow tested — only one profile fetch occurs on page load.

## 2026-03-01 — State Management / Guard Conditions
**Mistake:** `permissionsStore.loadPermissions()` destructured `isInitialized` but never used it as a guard, allowing redundant Supabase calls on every auth state change.
**Root Cause:** The guard was partially implemented — the value was read but the conditional check was omitted.
**Rule:** If a state value is destructured in a function, it must be used. Dead reads are a code smell — they usually indicate an incomplete implementation.
**Verified:** Store now skips reload when already initialized. Tests pass (284/284).
