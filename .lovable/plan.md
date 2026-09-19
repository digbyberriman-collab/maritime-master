# Automated sidebar accessibility regression tests

## Goal
Add repeatable tests that protect the sidebar’s keyboard navigation, visible focus treatment, ARIA state, and screen-reader announcements.

## Confirmed current state
- The project already uses Vitest, jsdom, React Testing Library, and jest-dom, so no new testing framework or package is needed.
- Sidebar controls already expose active-page, expanded/collapsed, drawer-control, and polite live-region semantics.
- Existing tests cover sidebar ordering, permissions, and general components, but there is no automated accessibility-focused sidebar test suite.

## Implementation
- Add focused component tests for the sidebar navigation in expanded and icon-only modes.
- Mock permissions, access checks, ordering, and notification counts so tests are deterministic and do not contact the backend.
- Cover:
  - keyboard focus and activation of navigation items;
  - focus-ring classes remaining present on interactive controls;
  - one correct `aria-current="page"` item for active and nested pages;
  - group `aria-expanded` state and accessible labels before and after keyboard toggling;
  - valid `aria-controls` references for expandable controls;
  - polite, atomic live-region announcements for the current page and group expansion/collapse;
  - accessible names retained in collapsed icon-only mode.
- Add focused layout tests for the desktop collapse control and mobile drawer trigger, including keyboard activation, `aria-expanded`, `aria-controls`, Escape dismissal, and focus return.

## Verification
- Run the new sidebar accessibility tests directly.
- Run the full Vitest suite to detect regressions elsewhere.
- Run the TypeScript check and confirm the preview build remains clean.
