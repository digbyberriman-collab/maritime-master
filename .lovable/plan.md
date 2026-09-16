# Module navigation aesthetic update

## Goal
Reframe the application navigation around six access-controlled modules: **Fleet, Vessel, Shoreside, Health & Wellness, Yard, and HRIS**.

## What will change

### Top module slider
- Move the six current top-level sections out of the blue left panel and into a horizontal sliding bar in the main header.
- Give the selected module a clearly animated blue highlight that slides between items rather than behaving like separate static buttons.
- Keep the full labels, including “Health & Wellness,” without crowding or overlap.
- Derive the selected module from the current page address so deep links highlight the correct module automatically.
- Hide modules the signed-in person cannot access; do not show disabled or locked placeholders.
- On phones and narrow tablets, retain the same bar as a horizontally swipeable row and automatically bring the selected module into view.

### Contextual blue folder panel
- Show only the selected module’s folders and nested subfolders in the left blue panel.
- Preserve the full expandable tree, active-page highlighting, saved folder ordering, and existing page destinations.
- Keep nested folders independently expandable while retaining clear hierarchy and indentation.
- When viewing the home dashboard, replace the module tree with useful dashboard shortcuts and recent/pinned destinations.
- Keep STORM branding, Settings, Report an Issue, and the signed-in profile anchored in the panel.

### Header and quick actions
- Replace the current quick-actions area in the header with the module slider.
- Move existing pinned and suggested quick actions into a compact floating action menu, available without competing with module navigation.
- Retain vessel selection, notifications, role information, account menu, and client branding in a balanced secondary area.

### Access behaviour
- Use the existing permission system as the source for both module visibility and folder visibility.
- Ensure changing access updates both navigation areas consistently, with no hidden module reachable through a stale visible link.
- Preserve direct route protection; this change will not weaken page-level access checks.

## Responsive and interaction details
- Desktop: fixed-width blue folder panel plus a full-width module slider in the header.
- Mobile: off-canvas blue folder panel, swipeable module slider, and a persistent control to reopen the panel.
- Use restrained motion for the sliding active indicator and panel content transition, respecting reduced-motion settings.
- Preserve keyboard navigation, focus visibility, labels, and touch-sized controls.

## Technical approach
- Split the current navigation rendering into a top-level module selector and a module-scoped folder tree, both sourced from the existing sitemap.
- Add a shared route-to-module resolver so header selection and sidebar contents cannot drift apart.
- Extend module access mapping for the six top-level module IDs where necessary, while retaining privileged-role behaviour.
- Convert the adaptive action bar into a floating menu without changing its pinned shortcuts or usage-based suggestions.
- Keep styling on the existing semantic design tokens and maritime blue system.

## Verification
- Check every visible module switches the slider highlight and replaces the left folder tree correctly.
- Open representative nested and placeholder pages from all six modules and confirm the active state survives refresh and direct links.
- Verify restricted modules disappear for lower-access accounts while authorised modules remain usable.
- Verify dashboard shortcuts, floating actions, mobile swipe navigation, folder-panel opening, keyboard navigation, and desktop layout.
- Confirm the application compiles cleanly and has no preview runtime errors.
