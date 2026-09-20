# Notification Center

## Build
- Add a dedicated Notification Center page with three tabs: pending compliance, unread notifications/messages, and overdue operational tasks.
- Reuse the current vessel scope and signed-in company access so the list matches sidebar badge counts.
- Show loading, empty, and error states, with severity/status, vessel, due date, and concise context on each row.
- Link every row to the most relevant existing page or record view; include clear “View all” destinations for each category.
- Add a Notification Center entry to the Fleet sidebar and make the header notification bell open the new center.

## Technical details
- Centralize notification-center queries and count derivation in one TanStack Query hook so the page and sidebar cannot drift.
- Read active alerts for compliance and unread items, and overdue maintenance tasks joined to equipment/vessel data.
- Keep existing access controls and row-level protections; no database changes are required.
- Add accessible tabs, labelled counts, keyboard focus states, and a live refresh announcement.
- Verify route navigation, desktop/mobile layout, empty states, type checking, and the current build signal.
