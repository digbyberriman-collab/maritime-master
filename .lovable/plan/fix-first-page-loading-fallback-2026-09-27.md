# Fix first-page loading fallback

## Changes
- Mark the initial STORM loading screen so its existing watchdog can detect when startup stalls.
- Keep the normal signed-in `/index` dashboard and signed-out sign-in redirect unchanged.
- Verify refreshes in both signed-out and signed-in states, including the mobile viewport.

## Technical details
The startup watchdog currently looks for a `data-storm-placeholder` marker that is missing from the initial page markup. Because the marker is absent, the watchdog cannot replace a stalled loading screen with the recovery message. Add the marker and validate normal startup plus the fallback path.
