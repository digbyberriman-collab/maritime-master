# Notifications + Users & Access refinements

Three pages, all under existing Administration nav. Adapted to STORM (semantic tokens, existing components, our module taxonomy) — not pixel-matched to Sealogical.

## 1. Notification Management (admin)

New route: `/notification-management` (sidebar: Administration → Notification Management, bell icon).

Page layout:
- Header: title "Notification Management", subtitle "Configure who receives notifications for each notification type"
- Stat strip: 4 metric cards — Total types, Configured, No recipients, Unique emails
- Filter chips row: `All types` + per-category counts (Safety, Certificates, Crew, Technical, Charter, Vessel, Reports) + `No recipients (n)` in destructive tone
- "Subscribe Email" primary button (top-right) → modal to add an email recipient to one or more notification types
- Body: grouped list by category. Each row shows: type name, cadence badge (`Realtime` / `Weekly` / `Daily`), recipient summary line (`peel@storm.com  All` or `No recipients` in muted/destructive), trailing email-count chip. Row click opens edit drawer.

Edit drawer (per type):
- Recipients multi-select (company users + ad-hoc emails)
- Vessel scope: `All vessels` or pick specific vessels
- Save persists to new `notification_subscriptions` row(s)

## 2. User Notifications (Inbox + Preferences)

New route: `/notifications` (replaces the existing Alerts bell-link target; existing `/alerts` page kept). Tabs:

- **Inbox** — chronological list of the current user's in-app notifications (reuse `alerts` query filtered to `assigned_to_user_id = me` or subscribed types). Mark read / mark all read.
- **Preferences** — grouped toggles (Safety, Certificates, Charter, Crew, Technical, Vessel, Reports). Each row: type name + cadence badge + description + single toggle (in-app on/off). Helper banner: "Email delivery is configured by your administrator in Notification Management."

## 3. Users & Access detail — refinements

Apply the Sealogical pattern (screenshot 5) to existing `UsersAccessDetailPage` without breaking what we just built:

- Keep the Crew Module Access preset dropdown and the grouped + expandable Other Modules.
- Add a new **Custom Permissions** card (shown only when preset = `Custom`) with two subsections:
  - **VIEW PERMISSIONS** — checkboxes: see crew list, view/edit crew profiles, view scheduling, access leave records, view/edit medical info (with `Sensitive` badge), access employment records (`Sensitive`), view appraisals
  - **APPROVAL PERMISSIONS** — checkboxes: conduct appraisals, approve leave / hours of rest / payroll / expenses, mark expenses paid, approve invoices, record invoice payments
- Add **Department Scope** card below: checkboxes Deck, Engineering, Interior, Galley, Medical, Administration. Helper: "No departments selected = access to ALL departments." Yellow info banner styling using `bg-warning/10`.

These map to fine-grained capability flags stored in `user_permission_overrides` (existing table) with new `module_key` values like `crew.view_medical`, `crew.approve_leave`, etc. Department scope persists via `restrictions` JSONB.

## Data model

New table `notification_types` (seed): `key`, `name`, `category`, `cadence` (`realtime|daily|weekly`), `description`, `default_enabled`.

New table `notification_subscriptions`: `id`, `company_id`, `notification_type_key`, `user_id` (nullable), `email` (nullable, for ad-hoc), `vessel_scope` (`all` | uuid[]), `channels` (`{in_app, email}` jsonb), `created_by`, timestamps. RLS scoped to `company_id` via `current_user_company_id()`; DPA/superadmin can write.

New table `user_notification_preferences`: `user_id`, `notification_type_key`, `in_app_enabled` (bool). RLS: user can read/write own row.

Capability flags: extend `modules` seed with `crew.view_medical`, `crew.edit_medical`, `crew.view_appraisals`, `crew.conduct_appraisals`, `crew.approve_leave`, `crew.approve_hours_of_rest`, `crew.approve_payroll`, `crew.approve_expenses`, `crew.mark_expenses_paid`, `crew.approve_invoices`, `crew.record_invoice_payments`, `crew.access_employment_records`. These slot into the existing override RPC flow.

## Files

New:
- `src/modules/notifications-admin/pages/NotificationManagementPage.tsx`
- `src/modules/notifications-admin/components/{StatStrip, CategoryFilterBar, NotificationTypeRow, SubscribeEmailDialog, EditSubscriptionDrawer}.tsx`
- `src/modules/notifications-admin/hooks/{useNotificationTypes, useSubscriptions, useSaveSubscription}.ts`
- `src/modules/notifications/pages/NotificationsPage.tsx` (Inbox + Preferences tabs)
- `src/modules/notifications/components/{InboxList, PreferencesGroups, PreferenceRow}.tsx`
- `src/modules/notifications/hooks/{useInbox, usePreferences, useSavePreference}.ts`
- `src/modules/users-access/components/{CustomPermissionsCard, DepartmentScopeCard, CapabilityCheckbox}.tsx`
- `src/modules/users-access/lib/capabilityCatalog.ts` (view/approval capability definitions)
- `src/modules/users-access/hooks/useSaveCapability.ts`
- Supabase migration: `notification_types`, `notification_subscriptions`, `user_notification_preferences`, modules seed additions, RLS policies.

Edited:
- `src/routes/index.tsx` — add `/notification-management`, `/notifications` lazy routes
- `src/modules/dashboard/components/fleet/FleetSubNav.tsx` — add "Notification Management" item (DPA/superadmin only)
- `src/modules/users-access/pages/UsersAccessDetailPage.tsx` — render `CustomPermissionsCard` (when Custom preset) + `DepartmentScopeCard`
- `src/shared/components/layout/Header.tsx` (or equivalent) — bell icon links to `/notifications`

## Out of scope

- Email sending pipeline (subscription rows are stored; existing alert/email engine wiring is a follow-up)
- Changes to existing `/alerts` page or alert engine rules
- Migrating older `NotificationsSection` settings (kept as-is)
