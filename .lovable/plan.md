# Balanced compact layout across STORM

## Goal
Fit substantially more operational data into each desktop view, reducing unnecessary scrolling without making the interface cramped or difficult to use. Mobile layouts will remain touch-friendly.

## Changes

1. **Compact the shared page frame**
   - Reduce the top navigation height, page margins, breadcrumb/title spacing, and gaps between major sections.
   - Keep the collapsed sidebar and mobile drawer behavior unchanged.
   - Preserve clear page titles, keyboard focus indicators, and accessible 44px mobile controls.

2. **Tighten shared interface elements**
   - Reduce default card header/content/footer padding and oversized card titles.
   - Make tables denser with shorter headers, narrower cell padding, and compact row spacing.
   - Slightly reduce desktop input, selector, tab, and standard button heights where safe.
   - Keep dialogs and touch layouts comfortable rather than forcing desktop density onto mobile.

3. **Apply consistent density to data-heavy pages**
   - Replace repeated large vertical gaps and padding across dashboards, Fleet/Vessels, Crew/HRIS, compliance, maintenance, logbooks, New Build, Refit, and planner views.
   - Compress summary tiles, filter bars, search controls, tab strips, and empty/loading states.
   - Preserve wide specialist workspaces such as logbook sheets and planners while giving their controls more usable screen area.

4. **Protect readability and behavior**
   - Keep existing colors, information hierarchy, navigation, permissions, data behavior, and actions unchanged.
   - Allow long labels and values to wrap or truncate appropriately without collisions.
   - Retain visible keyboard focus and accessible names throughout the denser layout.

5. **Validate representative workflows**
   - Check representative dashboard, table, form, planner, logbook, Crew/HRIS, New Build, and Refit pages on desktop and mobile.
   - Verify there is no overlapping or clipped content and that key actions remain easy to reach.
   - Run the existing tests and confirm the preview builds cleanly.

## Technical approach
- Start with the shared layout and reusable card/table/form primitives so most pages inherit the same balanced density.
- Use responsive utility classes so compact spacing applies primarily from tablet/desktop sizes while mobile retains usable touch targets.
- Follow with a focused page-level sweep only where local spacing overrides prevent the shared changes from taking effect.
- No database, permission, routing, or business-logic changes are required.
