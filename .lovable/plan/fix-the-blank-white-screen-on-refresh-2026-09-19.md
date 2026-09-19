# Fix the blank white screen on refresh

## What I found

The app itself is healthy: loaded fresh at phone size (440x807), it redirects to the STORM sign-in screen and renders fully, with a clean build and no crash errors. So the blank screen is not a broken page — it is the app never getting far enough to draw anything inside the Lovable preview frame.

Two confirmed weak points explain a permanently white screen there:

1. **Automatic reload loop.** The app is set to reload itself whenever a script or stylesheet fails to load. Inside the preview frame those requests have been failing with authorisation errors, so the app reloads, fails again, and reloads forever — the screen stays white and nothing is ever shown.
2. **Nothing to fall back on.** There is no error screen and no initial content at all: the page starts completely empty and is filled in by the app. If the app stops before drawing (reload loop, a hanging login-session read in the preview frame, or any single component throwing), the result is a silent white page with no message.

## The fix

- **Stop the reload loop.** Allow at most two automatic recovery reloads; after that, show a short "Couldn't load STORM — reload" screen with a button instead of reloading again.
- **Add a first-paint placeholder.** Put the STORM wordmark and a loading line directly in the page so something is always visible immediately, replaced as soon as the app draws.
- **Add a top-level safety net.** Wrap the app so an unexpected failure in any page shows a plain "Something went wrong" panel with a reload button, instead of a white screen.
- **Stop the login check from hanging.** If reading the saved session takes longer than a few seconds (which happens in the preview frame when the session broker doesn't answer), treat the user as signed out and show the sign-in screen rather than waiting forever.

## Technical notes

- `src/main.tsx`: replace the unconditional `window.location.reload()` in the `vite:preloadError`, `error`, and `unhandledrejection` handlers with a `sessionStorage`-counted guard (max 2 reloads per tab session, counter cleared once the app mounts); on exhaustion render a static recovery panel into `#root`.
- `index.html`: add inline markup inside `#root` (wordmark + "Loading...") so the first paint is never blank; React replaces it on mount.
- New `src/shared/components/AppErrorBoundary.tsx` wrapping `<AppRoutes />` in `src/App.tsx`, using semantic tokens, with a reload action.
- `src/modules/auth/contexts/AuthContext.tsx`: add a ~5s safety timer alongside `getSession()` that calls `setLoading(false)` if neither the listener nor `getSession()` has settled, mirroring the existing pattern in `src/modules/refit/lib/session.tsx`.
- No routing, permission, database, or business-logic changes.

## Verification

- Reload the app at desktop and phone sizes and confirm the sign-in screen appears every time.
- Confirm no repeated reload behaviour and no runtime errors in the console.
- Confirm signed-in pages (Dashboard, Crew List, Logbooks) still render.
- Run the accessibility/unit tests and confirm a clean build.
