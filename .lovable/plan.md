# Improve sidebar accessibility

## Changes
- Add strong, consistent keyboard focus rings to sidebar links, folder controls, account controls, and open/close buttons.
- Give icon-only and folder controls descriptive accessible names, including current and expanded/collapsed state.
- Announce sidebar navigation changes and folder expansion state through a polite screen-reader status region.
- Preserve existing active-page highlighting, collapsed mode, navigation behavior, and mobile drawer behavior.

## Validation
- Verify keyboard navigation and focus visibility in expanded and collapsed sidebars.
- Inspect active-page and folder controls for `aria-current`, accessible names, and expansion state.
- Confirm the screen-reader status text updates after opening or closing a section.
- Run type checks and confirm the preview build remains clean.
