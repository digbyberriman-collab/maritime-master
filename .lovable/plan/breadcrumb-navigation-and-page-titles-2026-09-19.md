# Breadcrumb navigation and page titles

## Goal
Add a consistent location header to authenticated app pages so users can see the active top-level module, sidebar section, and current page or nested detail.

## Implementation
- Derive the breadcrumb hierarchy from the existing sitemap, keeping sidebar labels and links as the source of truth.
- Match both exact pages and nested/detail URLs, with readable fallback labels for routes containing record IDs or action suffixes such as “Edit”.
- Add a compact global header above page content with linked ancestors and a clear current-page title.
- Keep existing page-specific headings and actions intact; the new header provides global orientation without changing workflows.
- Update the browser tab title to match the active page.
- Ensure the header wraps cleanly on mobile and remains accessible to keyboard and screen-reader users.

## Validation
- Verify representative top-level, nested sidebar, and detail routes in the signed-in preview.
- Check expanded and collapsed sidebars, desktop and mobile widths.
- Confirm links navigate correctly and no build or runtime errors remain.
