# Authenticated accessibility audit

## Goal
Audit the signed-in application for keyboard navigation, visible focus, accessible control names, and valid ARIA relationships, then deliver a severity-ranked findings report with reproducible evidence.

## Coverage
- Crawl all reachable signed-in pages from the route map and sidebar/module navigation.
- Exercise representative detail, editor, modal, menu, popover, table, upload, planner, and logbook states; dynamic pages will be tested where an accessible record exists.
- Include shared controls once at their source, then list every affected page instead of duplicating the same finding.
- Recheck the previously corrected sidebar and logbook controls to prevent regressions.

## Audit process
1. Build a route coverage matrix for the 143 static authenticated paths plus reachable dynamic/detail paths, recording redirects, permission-gated pages, empty states, and pages blocked by unavailable test data.
2. Run signed-in browser checks on each reachable page for:
   - keyboard-only traversal and activation, including Escape dismissal and focus return;
   - visible focus indicators and sensible focus order;
   - accessible names for buttons, links, fields, selectors, and icon-only controls;
   - unique, present targets for `aria-controls`, `aria-labelledby`, and `aria-describedby`, plus valid `aria-expanded`, `aria-current`, dialog, and live-region states.
3. Inspect shared and page-specific source for states automated traversal cannot open, prioritizing non-interactive click targets, custom widgets, raw icon controls, and repeated IDs.
4. Confirm candidate failures in the rendered page before reporting them, with screenshots or DOM evidence and exact affected locations.

## Deliverable
A concise report grouped by **Critical**, **Warning**, and **Info**, beginning with the critical count. Each finding will include:
- the affected page(s) and control;
- what fails and who it affects;
- reproduction steps and evidence;
- the shared cause when multiple pages are involved;
- a recommended fix order, starting with blockers.

The report will also include tested-page totals, skipped or data-blocked routes, and a clean-pass list for the four requested accessibility areas. No product code will be changed during this audit.

## Technical details
- Use the existing signed-in Lovable Cloud session against the local preview.
- Combine browser automation with focused source review; do not treat a static pattern match as a confirmed defect.
- Reuse the existing Vitest accessibility regressions as a baseline, but keep this audit independent of adding new dependencies.
- Avoid exposing account data in screenshots or report output beyond labels needed to identify a control.
