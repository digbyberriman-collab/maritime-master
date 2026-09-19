# Fix logbook ARIA references

## Goal
Remove the broken accessibility references reported for the **Select vessel** and **Book settings** controls without changing their appearance or behavior.

## Confirmed cause
Both controls use accessible Radix dropdown/popover primitives. In the live page, each closed trigger has an auto-generated `aria-controls` value, but its referenced popup is removed from the document while closed. The target exists only while the popup is open, which causes automated accessibility checks to report an invalid reference.

## Changes
- Give the vessel list and Book settings panel stable, unique IDs.
- Track the vessel selector’s open state, matching the Book settings control’s existing open state.
- Expose `aria-controls` only while the corresponding popup is open and mounted; preserve `aria-expanded`, accessible names, keyboard operation, focus handling, and Escape dismissal.
- Keep the existing shadcn/Radix controls rather than replacing them with custom widgets.

## Verification
- Check both controls while closed: no dangling `aria-controls` reference.
- Open each control and confirm its `aria-controls` points to exactly one existing element.
- Verify keyboard opening, selection, Escape closing, and visible focus states.
- Run the focused accessibility check and confirm the app build remains clean.
