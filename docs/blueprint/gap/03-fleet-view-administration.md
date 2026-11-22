# Fleet view administration — gap analysis

> Spec for implementers. It compares the rebuild blueprint (v1.3) for the reference app against STORM as the code stands today, and states what STORM must build for the **Administration** half of the Fleet view: Users & Access, Notifications, Support, Company FAQs, Add-ons, Vessel Settings, Vessels, Data protection (GDPR), Account and Security. Requirements are written as STORM requirements, in our own words. Blueprint sections are cited as `§n.n`; reference-app support tickets as `#n` (ticket numbers only, no personal data).
>
> **Relationship to gap doc 01** (`01-foundations-tenancy-roles.md`). Doc 01 owns the *model* for people, roles, permissions, vessels, vessel module settings, account and MFA (features F1–F55, workflows W1–W11). This doc owns the *admin pages* that sit on that model, and it is the primary spec for the five areas doc 01 left out: the notification engine and Notification Management, Support, Company FAQs and the Help centre, Add-ons, and Data protection (GDPR). Where a feature is already specified in doc 01, the inventory row here points to the F/W number and adds only page-level detail. If the two docs ever disagree on a model rule, doc 01 wins; on page layout and on the five areas above, this doc wins.

---

## Scope

**Blueprint sections covered**

| § | Topic | Notes |
|---|---|---|
| Exec summary (lines 1–94) | Fleet admin pages list; "activity notifications" engine; "company actor" | Read in full |
| §1.3, §1.4 | Fleet sidebar "Fleet Administration" group; top-bar help badge and bell | Sidebar shape confirmed on `image42.png` |
| §2.1–2.7 | Roles, presets, flags, module levels, Access Sets, account actions | Model in doc 01; page detail here |
| §3.23 | Add-on subscription | |
| §3.24 | Notification (activity feed item) | |
| §3.31 | Support ticket | |
| §3.32 | Company FAQ and suggestion | |
| §3.33 | GDPR records (activity, access review, retention, request, export, data held) | |
| §3.34–3.36 | Account, Add New Vessel fields, user security | Model in doc 01 |
| §4.11–4.20 | Users & Access, Notification Management, Support Tickets, Company FAQs, Add-ons, Vessel Settings, Vessels, Fleet GDPR, Account, Security | Core of this doc |
| §6.17, §9 | Support ticket workflow (observed from 580 activity entries; §9 supersedes §6.17) | State diagrams `image28.png` (§6.17, superseded) and `image27.png` (§9, authoritative) viewed |
| §6.20 | Company FAQ lifecycle | `image31.png` viewed |
| §6.21 | GDPR subject request | `image32.png` viewed |
| §6.22 | Add-on trial and subscription | `image33.png` viewed |
| §6.24 | User invitation and access change | Detail in doc 01 W2–W4 |
| §7.1, §7.6, §7.7, §7.11, §7.12, §7.13 | Notifications, audit & GDPR, add-on billing, sub-processors, save behaviours, vessel count | |
| §8.9 | Email notification management (81 types, 38 people, frequencies) | |
| §10.1, §10.2 | Known gaps relevant here (authenticator after confirm, ticket cost buttons, "Message <vendor>", full notification list, safety subscribers) | Treated as STORM design decisions below |

Screenshot `image42.png` (Users & Access › Vessel Crew › Matrix) was viewed: it confirms the 10-item **Administration** sidebar group, a numeric badge on Support Tickets, the five count chips, Rank/Name sort, 17 flag columns with four orange "sensitive" columns (View medical, Edit medical, Employment, Transfer crew), preset chips "HOD", "Custom", "Custom · HOD", and the footer rule "Nothing saves until you press Review & save".

**Support-ticket export** (`support-tickets.csv`, 142 tickets): read in full; every ticket touching login/invites, permissions, notifications, help/FAQ, add-ons, branding, hiding modules, or the ticket process itself is used in *Improvements over the reference*. Summary facts used: 109 of 142 tickets are category "General" and 107 are "All vessels" (the classification fields carry almost no information); 74 tickets carry a cost; priorities are 129 Normal / 11 High / 1 Urgent / 1 Low.

**STORM paths inspected (code read, not just names)**

- Navigation and routes: `src/config/sitemap.ts` (`fleetChildren`), `src/config/navigation.ts` (`ADMIN_NAV_ITEMS`, unused), `src/routes/index.tsx` (lines 172–720, 806, 820)
- Users & Access: `src/modules/users-access/pages/UsersAccessListPage.tsx`, `hooks/{useUsersWithAccess,useSavePermissionOverride,useUserAccessDetail,useDepartmentScope}.ts` (spot-checked against doc 01's findings)
- Notifications admin: `src/modules/notifications-admin/{pages/NotificationManagementPage.tsx,components/EditSubscriptionDrawer.tsx,components/CadenceBadge.tsx,hooks/useNotificationData.ts}`
- Notifications user side: `src/modules/notifications/{pages/NotificationsPage.tsx,pages/NotificationCenterPage.tsx,hooks/useNotificationCenter.ts,lib/notificationLinks.ts}`, bell in `src/shared/components/layout/GlobalHeaderControls.tsx` / `DashboardLayout.tsx`, `src/modules/settings/components/sections/NotificationsSection.tsx`
- Email: `supabase/functions/send-email/index.ts`, `supabase/functions/hr-daily-sweeper/index.ts`, `supabase/config.toml`
- Support / feedback / help: `src/modules/help/pages/{SupportPage,HowToGuidesPage,PrivacyPolicyPage,TermsOfServicePage}.tsx`, `src/modules/settings/components/sections/SupportSection.tsx`, `src/modules/feedback/{store/feedbackStore.ts,pages/FeedbackAdmin.tsx,components/FeedbackPanel.tsx,types.ts}`
- Legal module (reusable ticketing engine): `src/modules/legal/lib/{requests,markdown,storage}.ts`, `components/requests/{CommentThread,EventTimeline,AttachmentList,StatusStepper}.tsx`, `components/documents/{MarkdownEditor,MarkdownView}.tsx`, `hooks/useLegalAttachments.ts`
- GDPR / retention: `src/modules/settings/components/sections/{GDPRRequestsSection,DataRetentionSection,DataExportsSection}.tsx`, `src/modules/compliance/hooks/{useGDPRRequests,useDataRetention}.ts`, `src/modules/hris/components/dashboard/DataGovernanceTab.tsx`, `src/modules/hris/hooks/useHrDashboard.ts` (`exportCrew`, `gatherCrewData`)
- Settings shell: `src/modules/settings/pages/{Settings,BrandingSettings}.tsx`, `src/shared/hooks/useBranding.ts`, `components/sections/SecuritySection.tsx`
- Vessels / account: `src/modules/vessels/pages/{Vessels,CompanyDetails}.tsx`, `components/VesselFormModal.tsx`
- Migrations: `20260522163528_*` (notification types, subscriptions, user prefs, crew flag modules), `20260917110000_*`, `20260917130000_*`, `20260917140000_*`, `20260919140000_*` (more notification types), `20260917225003_*` (`support_tickets`), `20260228120000_create_feedback_submissions.sql`, `20260129113801_*` (`gdpr_requests`), `20260127120753_*` (`audit_logs`), `20260127181349_*` (`user_preferences`)
- Generated types (grepped): `notification_types`, `notification_subscriptions`, `user_notification_preferences`, `user_preferences`, `notification_logs`, `alerts`, `support_tickets`, `gdpr_requests`, `data_retention_policies`, `audit_logs`, `permission_audit_log`, `companies`, `crew_bank_details`, `candidates`, `payroll_runs`, `user_sessions`, `login_history`
- Standards and audits: `docs/permissions/catalogues/storm.json` (fleet.administration and admin.* subcategories), `docs/permissions/MASTER-PROMPT.md` (entitlement rule), `docs/SYSTEM-AUDIT-2026-09-19.md` (feedback never applied live, notification fragmentation M2, `notification_logs` never read M12, hand-written migrations not auto-applied H3)

### Headline findings from the code

1. **Notifications are configured but never delivered.** `notification_types` (about 38 seeded types, cadence limited to realtime / daily / weekly), `notification_subscriptions` and `user_notification_preferences` exist and Notification Management edits them, but **nothing reads the subscriptions**: no dispatcher, no digest job, and `send-email` is not called from the app. There is no activity-event table, so there is no fleet activity feed and no per-user inbox (the `/notifications` "Inbox" tab is a static "Your inbox is empty"). The bell and Notification Center read the `alerts` table (things needing attention), which is a different concept from the reference's activity feed.
2. **Two competing personal-preference stores**: `user_notification_preferences` (per-type in-app toggles on `/notifications`) and `user_preferences` (channels, severities, digest times on Settings › Notifications). Neither is read by any sender.
3. **Support is a write-only form.** `support_tickets` has subject, description, category, priority and a 4-value status, but no vessel, attachments, comments, contributors, cost, events or read state; the table grants no UPDATE to anyone but the service role, so status never moves. The page shows only the user's last ten tickets and tells the user a confirmation email was sent when none is. The SELECT policy lets a `dpa` / `superadmin` role holder read tickets **of every tenant** (no company check). The feedback panel mounted in every layout writes to `feedback_submissions`, a table whose migration was never applied live (system audit), so every submission fails.
4. **No Company FAQs, no Help centre content model.** The How-to Guides page is hard-coded content; the Settings "Support" section is a static mock (inert cards, unbound inputs, button without handler).
5. **No add-ons or entitlements** anywhere in schema or UI.
6. **GDPR exists as fragments**: a requests table (subject must be a user with a login; 30-day rather than calendar-month deadline; no "who from", no extension state) listed in personal Settings with no way to record a request; retention policies for HR record types; a client-side JSON export in HRIS that is limited by the exporter's RLS and is logged only when the subject has a login. No activity view, access review, legal hold, data-held counts or overview. `audit_logs` has no `company_id` and accepts inserts from any signed-in user, so it cannot serve as a data-protection audit trail as is.
7. **Admin pages are scattered and mis-linked**: "Account" opens personal Settings; "Notification Management" lives at `/settings/notifications` while personal Settings has its own "Notifications" section; GDPR lives inside personal Settings; Company FAQs, Add-ons, Vessel Settings, GDPR and Security have no Fleet nav entry. Vessels, Users & Access, Account and Security findings are as recorded in doc 01 (headline findings 1–8).

---

## Target information architecture

Route conventions follow doc 01: fleet pages under `/fleet/…`, vessel pages under `/v/:vesselCode/…`, personal pages under `/me/…`, path-based routes with `?tab=` / `?view=` for in-page state. Labels below are STORM UI labels (no reference-app branding).

### Fleet view › Administration (sidebar group "Administration")

Visible to the account owner, account admins, and shore staff who hold at least one admin capability. Each leaf is hidden when the user lacks its view capability (proposed keys in brackets; see Implementation notes for the catalogue additions).

```
Administration
├─ Users & Access            /fleet/admin/users/:tab           tab ∈ crew | admins | shore | sets | viewers   [admin.access.users_access.view]
│   ├─ Vessel Crew           /fleet/admin/users/crew?vessel=dra&view=list|matrix&show=all|custom|hod|medical|employment|payroll
│   ├─ Account Admins        /fleet/admin/users/admins
│   ├─ Shore Staff           /fleet/admin/users/shore
│   ├─ Access Sets           /fleet/admin/users/sets , /fleet/admin/users/sets/:setId
│   ├─ External Viewers      /fleet/admin/users/viewers                (phase 2, doc 01 F36)
│   └─ Person access         /fleet/admin/users/people/:profileId?vessel=dra
├─ Notifications             /fleet/admin/notifications/:tab   tab ∈ activity | email | log          [fleet.administration.notification_management.view]
│   ├─ Activity              /fleet/admin/notifications/activity?module=&vessel=        (fleet activity feed, §4.12)
│   ├─ Email delivery        /fleet/admin/notifications/email?view=by-type|by-person     (§8.9)
│   └─ Delivery log          /fleet/admin/notifications/log      (STORM addition: sent / failed / bounced, 90 days)
├─ Support                   /fleet/admin/support?tab=open|completed|all   (badge = tickets waiting on the account)  [fleet.administration.support_tickets.view]
│   ├─ New request           /fleet/admin/support/new
│   └─ Request detail        /fleet/admin/support/:ref           (ref = TKT-YYYY-NNNN)
├─ Company FAQs              /fleet/admin/faqs?tab=entries|suggestions&status=&category=    [fleet.administration.company_faq.edit]
│   ├─ New entry             /fleet/admin/faqs/new
│   └─ Edit entry            /fleet/admin/faqs/:faqId
├─ Add-ons                   /fleet/admin/add-ons                [fleet.administration.addons.view]
├─ Vessel Settings           /fleet/admin/vessel-settings , /fleet/admin/vessel-settings/:vesselCode   [fleet.administration.vessel_settings.view]
├─ Vessels                   /fleet/admin/vessels?status=active|inactive|archived , /fleet/admin/vessels/new   [fleet.operations.vessels.view]
├─ Fleet Groups              /fleet/admin/fleet-groups           (STORM extra, doc 01 F7)
├─ Data protection           /fleet/admin/gdpr/:tab   tab ∈ overview | requests | activity | access | retention | data-held   [fleet.administration.gdpr.view]
│   └─ Request detail        /fleet/admin/gdpr/requests/:requestId
├─ Account                   /fleet/admin/account                [fleet.administration.account.config]
└─ Security                  /fleet/admin/security               [fleet.administration.security_policy.config]
```

"Data protection" is the nav label (clearer than an acronym for crew-facing staff); the page header reads "Data protection (GDPR)".

### Global, both views (top bar, §1.4)

```
Help (?) with badge     → popover: search box, top 5 FAQs for the current page's module, "Help centre", "Contact support", "Report a problem"
  Help centre           /help?q=&category=                    platform FAQs + this account's published Company FAQs, one search
  FAQ entry             /help/faqs/:faqId
  Suggest a question    /help/suggest                          (also inline when a search finds nothing)
  My requests           /help/requests?tab=open|completed      tickets I raised or contribute to
  New request           /help/requests/new?from=<current path> context captured automatically
  Request detail        /help/requests/:ref                    same component as the fleet admin detail, fewer controls
Bell with badge         → popover (latest 20, mark all read) ; full page /inbox?tab=inbox|attention
  Inbox                 /inbox?tab=inbox                       per-user notification items (new)
  Needs attention       /inbox?tab=attention                   today's Notification Center (alerts + overdue tasks)
My notifications        /me/notifications                      in-app and email toggles per type, digest time
My security             /me/security                           authenticator, recovery codes, trusted devices, sessions (doc 01 W9)
```

Crew and shore staff with no admin rights reach Support and FAQs only through Help; the Administration group never appears for them.

### Vessel view (`/v/:vesselCode/…`)

This domain has no vessel-view pages of its own, but it owns three vessel-view behaviours:

1. **Locked module (add-on not active)**: the module tab shows a lock icon. Opening it shows an explanation card: what the add-on includes, "Request this add-on" for everyone, and "Start free trial" / "Add to subscription" for the owner and admins (same actions as the Add-ons page).
2. **Switched-off module** deep link: "Charter is switched off for Draak. An account admin can switch it on in Vessel Settings." with a link for admins (doc 01 W6).
3. **Admin shortcut**: for owner/admins, the vessel module tab bar shows a cog linking to `/fleet/admin/vessel-settings/:vesselCode`.

### Platform console (STORM staff only, doc 01 F3)

```
/platform/support                 all tenants' requests: triage queue, assignee, cost, status, internal notes
/platform/faqs                    platform-wide FAQ entries (shown to every account)
/platform/add-ons                 add-on catalogue, prices, trial length
/platform/accounts                (doc 01 W1)
```

### Legacy route redirects (keep one release)

| From | To |
|---|---|
| `/settings/notifications` | `/fleet/admin/notifications/email` |
| `/notifications` | `/me/notifications` |
| `/notifications/center`, `/alerts` | `/inbox?tab=attention` |
| `/help/support` | `/help/requests/new` |
| `/help/how-to-guides` | `/help` |
| `/admin/feedback` | `/fleet/admin/support?source=feedback` (tenant) or `/platform/support` (staff) |
| `/settings` sections `gdpr-requests`, `data-retention`, `data-exports` | `/fleet/admin/gdpr/requests`, `/fleet/admin/gdpr/retention`, `/fleet/admin/gdpr/requests` |
| `/settings/branding`, `/vessels/company-details` | `/fleet/admin/account` |
| `/vessels/list` | `/fleet/admin/vessels` |
| `/users-access`, `/users-access/:userId`, `/admin/roles`, `/settings/permissions` | as doc 01 |

---

## Feature inventory

Status key: complete / partial / placeholder / missing. Effort: S < 1 day, M 1–3 days, L 3–10 days, XL > 10 days.

### A. Shell and navigation

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| A1 Administration sidebar group with 10 leaves, capability-gated, Support badge | §1.3, `image42` | partial | `src/config/sitemap.ts` `fleetChildren` (Vessels, Users & Access, Notification Center, Notification Management → `/settings/notifications`, Support Tickets → `/help/support`, Account → `/settings`); `ADMIN_NAV_ITEMS` in `navigation.ts` never rendered | No group heading; Company FAQs, Add-ons, Vessel Settings, GDPR, Security, Fleet Groups missing; Account points at personal settings; no badge; no capability gating (`/admin/*` ungated, system audit H7). Build the tree above | P0 | S |
| A2 Help (?) in top bar with badge and contextual FAQs | §1.4, #288 | missing | Help reachable only via sidebar account menu / footer | Popover with search, module-aware top FAQs, Contact support, Report a problem; badge for new/updated FAQs since last open | P1 | S |
| A3 Personal pages with URLs (`/me/notifications`, `/me/security`) separate from admin pages | §7.1, §4.20 | partial | `src/modules/settings/pages/Settings.tsx` keeps section in component state; admin and personal content mixed (GDPR, data retention, vessel access inside personal Settings) | Split per the IA; move admin sections out (doc 01 F55) | P1 | S |

### B. Users & Access (§4.11, §2; model in doc 01)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| B1 Vessel Crew list: find crew, vessel select, count chips, preset/set chip or "Custom +n −n", orange sensitive chips, other-module R/W chips, Login as / Edit | §4.11 | partial | `UsersAccessListPage.tsx`, `useUsersWithAccess.ts` | Doc 01 F37. Page detail in *Workflows → Users & Access pages* | P0 | M |
| B2 Matrix view (17 columns, staged, Review & save) | §2.3, §4.11, `image42` | missing | — | Doc 01 F38 / W3 | P0 | M |
| B3 Edit person (preset, flags, scopes, module levels, save as set, account actions) | §4.11, §2.6 | partial | `UsersAccessDetailPage.tsx` (autosaves every click, no audit) | Doc 01 F39; explicit Save Permissions | P0 | M |
| B4 Account Admins tab + Invite Admin form | §4.11, §2.1 | missing | — | Doc 01 F23, F41, W2; field table below | P0 | M |
| B5 Shore Staff tab + Invite Shore Staff form + Assign to vessel | §4.11 | missing | — | Doc 01 F24, F42, F49 | P0 | M |
| B6 Access Sets tab (cards, usage, editor, delete guard) | §2.5 | partial | `RolesPermissionsPage.tsx` (global role matrix, not in nav) | Doc 01 F30, F43, W4 | P0 | M |
| B7 Invitation status, resend, expiry, copy link | §6.24, #278 #282 #120 #313 #325 | partial (buggy) | `send-invitation`, `_shared/invite-helpers.ts`, `admin-actions` | Doc 01 F46, F47 (invites marked sent when the email failed; reset/resend send nothing) | P0 | M |
| B8 Login as / view as | §2.6, §7.10 | missing | — | Doc 01 F48, W8 | P1 | L |
| B9 Last active and T&C / Privacy acceptance columns | §4.11 | missing | `profiles.last_login_at`, `user_sessions`, `login_history` (never written) | Doc 01 F50 | P1 | S |
| B10 Every permission change logged and shown in Data protection › Activity | §6.24, §7.6 | partial | `permission_audit_log` (users-access writes nothing to it) | Doc 01 F53 + feed into G3 below | P0 | S |
| B11 Bulk edit and "why can / can't they" inspector | #146 #138 | missing | — | Doc 01 F40, F44 | P1 | M |

### C. Notification engine and Notification Management (§4.12, §3.24, §7.1, §8.9)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| C1 Notification event outbox: one row per thing that happened (type, vessel, module, record, reference, title, summary, deep link, actor, must-act audience) | §3.24, §7.1 | missing | — (`alerts` holds attention items, not events) | `notification_events` table + `emit_notification_event()` definer function every domain calls from its workflow RPCs | P0 | M |
| C2 Notification type registry (module, default frequency, allowed frequencies, audience, sensitivity, deep-link pattern, owning domain) covering every sign/submit/approve event (reference: 81 types) | §8.9 | partial | `notification_types` (≈38 seeded across `20260522163528_*` and four later migrations; `category`, `cadence` ∈ realtime/daily/weekly, `default_enabled`) | Add `module_key`, `default_frequency`, `allowed_frequencies`, `audience`, `is_sensitive`, `link_template`, `owner_domain`, `is_mandatory`; seed the list in *Data model → notification type catalogue*; each domain doc adds its own rows | P0 | M |
| C3 Dispatcher: resolves recipients, applies preferences and frequency, batches, sends, retries, logs | §7.1, §8.9 | missing | `supabase/functions/send-email` (Resend, idempotency via `notification_logs`) is never called from the app; nothing reads `notification_subscriptions` | Edge function `notification-dispatcher` on a 1-minute schedule + digest builder; email templates for single item and digest | P0 | L |
| C4 Frequencies: Immediately, Batched (15 min), Batched (held), Every 2 hours, Daily, Weekly (Mon), Weekly digest (Mon) — per type default, per recipient override | §8.9 | partial | `cadence` column (3 values, type-level only), `CadenceBadge.tsx` | New enum, per-subscription `frequency`, per-person override | P0 | S |
| C5 Email Notification Management — By notification: rows Notification · Who is emailed · Sent (90 days); filters vessel, module, recipients (any / none / has external), search; "Sent to the people who must act · add extra addresses" rows | §8.9 | partial | `NotificationManagementPage.tsx` (stat cards, category chips, "No recipients" filter, grouped list), `EditSubscriptionDrawer.tsx` (free-text emails only, scope always "All vessels", both channels forced on) | People picker from account members; per-recipient vessel scope and frequency; must-act explanation; sent counts; vessel and search filters; atomic save (today: delete-all then insert, so a failed insert wipes recipients) | P0 | M |
| C6 Email Notification Management — By person: one row per person (member or external address) with the types they receive, frequency, last sent; "Add a person" | §8.9 | missing | — | Second view over the same rows; add person = pick member or enter external email, then tick types | P1 | M |
| C7 Delivery log and "Sent in last 90 days" counts; bounce / failure visibility | §8.9, #163 | missing | `notification_logs` (written by `send-email` only, no `company_id`, never read — system audit M12) | Add `company_id`, `event_id`, `subscription_id`, `batch_id`; provider webhook for delivered / bounced; Delivery log tab; per-person "last 10 emails" | P1 | S |
| C8 Fleet activity feed: Vessel · Module chip · Notification (title, description, action link) · Time; Module and Vessel filters with None/All | §4.12, §3.24 | missing | `NotificationCenterPage.tsx` shows alerts + overdue tasks (different purpose) | Activity tab reading `notification_events` limited to vessels in reach and modules the viewer can read; 365-day window | P1 | M |
| C9 Per-user inbox behind the bell: unread badge, mark read / all read, archive, deep link, realtime | §1.4, §7.1 | partial | Bell reads `alerts` (`GlobalHeaderControls.tsx`); `/notifications` inbox tab is static text | `user_notifications` rows fanned out from events; bell popover + `/inbox`; keep alerts as "Needs attention" tab | P0 | M |
| C10 Personal preferences: in-app and email per type, digest time; one row shared with the admin page ("one setting, two windows") | §7.1, #79 | partial | Two stores: `user_notification_preferences` (in-app only, `/notifications`) and `user_preferences` (channels/severities/digest, Settings › Notifications) | Single store (`user_notification_preferences` + `email_enabled`, `frequency_override`); retire notification fields of `user_preferences` | P1 | S |
| C11 Deep links to the exact record in the right vessel, plus a short excerpt in the email | #252 | partial | `notificationLinks.ts` maps keywords to module list pages (`/incidents`, `/ism/drills`) with `?id=` | Store `link_path` on the event (`/v/dra/safety/permits/<id>`); excerpt from `summary` except for sensitive types | P0 | S |
| C12 Audience routing: must-act people, vessel safety subscribers, DPA-flagged admins for data-protection events, the subject person (e.g. crew reminders) | §7.1, §8.9, #96 #142 #286 | missing | — | Audience resolver in the dispatcher; "vessel subscribers" = subscriptions scoped to that vessel and module | P1 | M |
| C13 Manage-permission check on Notification Management | §8.9 | partial | RLS: insert/update/delete only for legacy `has_role(dpa / superadmin)` | Capability `fleet.administration.notification_management.config`; admins limited to vessels in their reach | P0 | S |

### D. Support (§4.13, §3.31, §6.17, §9)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| D1 Request list with Open / Completed tabs: Ref, Title (+ comment and attachment counts, unread dot), Vessel, Cost, Priority, Status, Whose move, Updated | §4.13 | partial | `src/modules/help/pages/SupportPage.tsx` (own last 10 tickets: ref, subject, category, date, status) | Account-wide list for owner/admins, own + contributed for others; tabs, sort, filters (status, vessel, category, priority, source), search | P0 | M |
| D2 New request form: Title, Details, Category, Priority, Vessel (default from current scope; "All vessels"), Attachments | §4.13, §3.31 | partial | `SupportPage.tsx` form (subject ≥ 4 chars, description ≥ 15, category, priority) | Vessel field, attachments (≤ 50 MB each, §7.5 types), STORM category list, auto-captured context (page, vessel, role, app version, browser), FAQ and duplicate suggestions while typing | P0 | S |
| D3 Request detail: chips (status, priority, category), meta (submitted by, vessel, created, updated), description, attachments, contributors, discussion (Markdown with preview), activity log; opening marks read | §4.13, §3.31 | missing | — | New page; reuse legal `CommentThread`, `EventTimeline`, `AttachmentList`, `MarkdownEditor` / `MarkdownView` | P0 | L |
| D4 Status workflow (Requested, Awaiting approval, Approved, In progress, Testing, To be invoiced, Complete, Cancelled), server-enforced | §9, `image27` | missing | `support_tickets.status` ∈ open/in_progress/resolved/closed; no UPDATE grant for `authenticated`, so status never changes | `support_request_transition()` RPC with the transition table in *Workflows*; event row per transition | P0 | M |
| D5 Cost & approval: STORM sets a quote; owner/admin approves or declines; re-approval on change; "no charge" reason | §4.13, §6.17, §9, #79 | missing | — | Cost block, approve / decline actions with confirmation, quote history | P1 | M |
| D6 Contributors (members or email) notified on every update | §4.13, §3.31 | missing | — | `support_request_contributors`; batched emails (15 min) | P1 | S |
| D7 Keep open / auto-complete after verification window | §4.13, §6.17 | missing | — | Nightly job completes Testing requests after 14 days without reply unless Keep open | P2 | S |
| D8 Unread state and sidebar badge | §1.3, §3.31 | missing | — | `support_request_reads`; badge = requests waiting on the account + unread updates | P1 | S |
| D9 Quick message / Report a problem from any page (screenshot, page, vessel, role, app version) | §4.13 "Message <vendor>", §10.2 | partial (broken) | `src/modules/feedback/*` panel in every layout; `feedback_submissions` migration never applied live, `feedback-screenshots` bucket absent, upload errors swallowed, admin policies by legacy role across all tenants | Fold into Support: panel creates a request (`source = 'quick'`) with screenshot in the private support bucket; retire `feedback_submissions` | P1 | M |
| D10 STORM staff triage console across tenants (queue, assignee, internal notes, set cost, change status) | §9 (vendor side) | missing | `/admin/feedback` (`FeedbackAdmin.tsx`) reads the broken feedback table | `/platform/support`, `is_platform_staff()`; internal notes never visible to tenant | P0 | L |
| D11 Tenant isolation and honesty fixes on the existing table | — | partial (bug) | `20260917225003_*`: SELECT allows any `dpa`/`superadmin` role holder regardless of company; page claims a confirmation email that is never sent; hard-coded vendor contact details in `SupportPage.tsx` | Add company check; send the real confirmation; move contact details to platform settings | P0 | S |
| D12 Export (CSV) and summary (counts by status / category / vessel, total approved cost) | §9 (Summary tab) | missing | — | Export button on the list; small summary strip | P2 | S |

### E. Company FAQs and Help centre (§4.14, §3.32, §6.20)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| E1 Company FAQ entries: category, order (default 100), question (≤ 300), answer Markdown (≤ 20,000, images, preview); Save draft / Save & publish | §4.14, §3.32 | missing | — | `faq_entries` + editor page; reuse legal `MarkdownEditor` (add image block) | P1 | M |
| E2 Entries tab filters (All / Draft / Published / Archived, category), reorder | §4.14 | missing | — | List with drag reorder within a category | P1 | S |
| E3 Suggestions tab (Open / Answered / Dismissed) and "Suggest a question" for every user | §4.14, §3.32 | missing | — | `faq_suggestions`; answer by linking or creating an entry | P2 | S |
| E4 Help centre: one searchable list of platform FAQs and this account's published entries, by category, with deep links to pages | §4.14, #288 | placeholder | `HowToGuidesPage.tsx` (hard-coded `GUIDE_CATEGORIES`), Settings `SupportSection.tsx` (static mock) | Data-driven page; migrate the hard-coded guides into platform FAQ seed rows; full-text search | P1 | M |
| E5 Platform FAQ authoring (STORM staff) | §4.14 ("next to the vendor's FAQs") | missing | — | Same table with `company_id IS NULL`, authored in `/platform/faqs` | P1 | S |
| E6 Assistant answers grounded on published FAQs, with "didn't help → suggest / contact support" | #288 | missing | — | P2 phase after E1–E4; cite FAQ ids in answers | P2 | L |

### F. Add-ons (§4.15, §3.23, §6.22, §7.7)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| F1 Add-on catalogue: name, price per vessel per month, trial length, what's included, Learn more | §4.15, §7.7 | missing | — | `addons` table, platform-managed | P2 | S |
| F2 Vessels × add-ons matrix: cell states Off / Off · trial used / Trial until <date> / Subscribed; Start free trial, Add, Switch off; autosave; "Showing n of n vessels" (counted vessels only) | §4.15, §7.13 | missing | — | Page + `vessel_addon_subscriptions` | P2 | M |
| F3 Entitlement check: add-on-gated modules and capabilities return false when the vessel has no active trial or subscription; locked tab in vessel view | §4.15, §7.7 | missing | PMS `MASTER-PROMPT.md` line 203 defines account-level `has_entitlement`; nothing implemented | Per-vessel `vessel_has_addon(vessel, addon)` used by `has_capability` and nav | P1 | M |
| F4 Trial rules: 90 days, once per add-on per vessel, owner/admin only; expiry job and reminders | §4.15, §6.22 | missing | — | Nightly job; reminders at 14, 3 and 0 days | P2 | S |
| F5 Request an add-on from a vessel → owner and admins notified, feed item, one-click action | §6.22, #268 | missing | — | `addon_requests` + notification type `addon_requested` | P2 | S |
| F6 Billing hand-off ("appears on next invoice"), invoices | §4.15, §7.7 | placeholder | Settings `case 'billing'` → `PlaceholderSection` | Record billable changes in `addon_billing_events`; invoices and payment are a separate decision (open question) | P2 | M |

### G. Vessel Settings and Vessels (§4.16, §4.17; model in doc 01)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| G1 Vessel Settings matrix: vessels × modules, cell types toggle / toggle + "from" date / label choice; autosave with Undo | §4.16, §3.3 | missing | — | Doc 01 F11, W6; page detail below | P0 | M |
| G2 Per-vessel settings page with an explanation per module | §4.16 | missing | — | `/fleet/admin/vessel-settings/:vesselCode` | P0 | S |
| G3 Fleet-wide toggles with per-vessel exceptions (e.g. Safety Management Manual hidden on all vessels) | §4.16 | missing | — | Doc 01 F12 | P1 | S |
| G4 Add-on-gated module cells show "Requires <add-on>" and link to Add-ons | §4.15, §4.16 | missing | — | Matrix cell state from F3 | P2 | S |
| G5 Vessels list: name, code, type, flag, IMO, status chip, counted flag, Open vessel / Current vessel; Add vessel | §4.17 | partial | `/vessels/list` → `Vessels.tsx`, `VesselFormModal.tsx` (name required, IMO/MMSI/call sign/type/flag and more; add/edit/delete shown to everyone) | Doc 01 F8–F10: gating, codes, lifecycle filter, validation (IMO check digit) | P0 | S |
| G6 New vessel seeding (default certificate sections and types, module defaults, counters) | §4.17 | missing | — | Doc 01 F13 `create_vessel()` | P1 | M |

### H. Data protection (GDPR) (§4.18, §3.33, §6.21, §7.6, §7.11)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| H1 Requests tab: Record a request (who from, person search or free-text name, request type, date received, notes); Open and Closed lists with due-date countdown | §4.18, §6.21 | partial | `gdpr_requests` (`subject_user_id` NOT NULL → only people with a login; types access/rectification/erasure/portability/restriction/objection; status pending/in_progress/completed/rejected; deadline set to +30 days by `useGDPRRequests.createRequest`, which no UI calls); list + status buttons in personal Settings `GDPRRequestsSection.tsx` | Record form; "who from" kinds (crew, guest, occasional worker, candidate, someone else); subject by profile or free text; calendar-month due date; Extended state; outcomes; request detail page with timeline | P0 | M |
| H2 Export a person's data: one file with every record (incl. medical and pay) plus document links that expire after one hour; every export logged | §4.18, §3.33 | partial | HRIS `DataGovernanceTab.tsx` → `useHrDashboard.exportCrew` / `gatherCrewData` (client-side JSON, limited to what the exporter's RLS allows, no documents, logged only when the subject has a login) | Server-side `gdpr-export` edge function (service role, company-scoped), ZIP with JSON + CSV + index, signed document links (1 h) or embedded files, stored in a private bucket, every generation and download logged | P0 | M |
| H3 Activity tab: last 365 days of exports, legal holds, permission changes, users created / deleted, bank detail changes (not sign-ins); columns When, What, By, About, Vessel | §4.18, §3.33, §7.6 | missing | Sources are fragmented: `permission_audit_log`, `audit_logs` (no `company_id`, INSERT allowed for any signed-in user), nothing on `crew_bank_details` changes | Append-only `data_protection_events` written only by definer functions / triggers; tab with filters and CSV | P1 | M |
| H4 Access tab: everyone who can see personal data with reach, Personal details / Medical / Employment / Payroll levels, last active; Download CSV; Mark review complete | §4.18, §2.7 | missing | — | Read from `get_effective_capabilities` (doc 01); `access_reviews` (doc 01 W11) | P1 | M |
| H5 Retention tab: past crew, records that must be kept, keep-until date, status; payroll and employment kept 6 years after last employment; legal hold set on the crew profile | §4.18, §3.33, §7.6 | partial | `data_retention_policies` per HR record type + `hr_record_metadata` pending-archive list (`DataRetentionSection.tsx`, `useDataRetention.ts`); HR sweeper functions `hr_archive_due_records` | Past-crew view, keep-until computed from last employment end, legal hold (none exists anywhere), deletion approval queue | P1 | M |
| H6 Legal hold on crew profile (set, release, reason) overriding retention and erasure | §4.18, §6.21 | missing | — | `crew_legal_holds`; banner on crew profile; blocks anonymisation | P1 | S |
| H7 Data held tab: per vessel current crew, not yet joined, past crew, guests; account-wide occasional workers and candidates; sensitive data counts (medical records, passport numbers, pay details) by vessel | §4.18, §3.33 | missing | Tables exist to count from (`crew_assignments`, `candidates`, `crew_bank_details`, `payroll_runs`, medical tables) | Definer function returning counts; tab | P2 | S |
| H8 Overview tab: controller (the account), processor (STORM operator), sub-processors with purpose and region, DPA contact | §4.18, §7.11 | missing | `companies.dpa_name`, `dpa_email`, `dpa_phone_24_7` exist | Platform-managed `platform_subprocessors`; page | P2 | S |
| H9 DPA notifications: request recorded, due in 7 days, due tomorrow, overdue, export generated, legal hold changed, sensitive grant changed | §4.11 (DPA role), §7.1, §7.6 | missing | — | Notification types with audience `dpa` (section C) | P1 | S |
| H10 Erasure and correction handling: erasure plan respecting retention and legal holds; correction recorded against the request | §6.21 | missing | — | Plan view + `gdpr_anonymise_person()` definer function, DPA approval | P1 | M |

### I. Account and Security (§4.19, §4.20, §3.34, §3.36; model in doc 01)

| Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|
| I1 Account page: fleet logo, owner (read-only), contact details (contact name, company name, phone with country code, address), status, registration date, associated fleets | §4.19, §3.34 | partial | `BrandingSettings.tsx` (display name, colour, logo), `CompanyDetails.tsx` (mock data) | Doc 01 F1; single page, layout below | P1 | M |
| I2 Logo rules: JPEG / PNG / WebP, ≤ 5 MB, Choose / Remove | §4.19 | partial | `BrandingSettings.tsx` accepts PNG/SVG ≤ 2 MB; `useBranding.uploadLogo` writes to public bucket `client-logos`; gated by legacy `profiles.role` | Accept JPEG/PNG/WebP ≤ 5 MB; drop SVG (script risk) or sanitise; owner/admin capability | P2 | S |
| I3 Join vessel as crew (vessel, position, department) | §4.19 | missing | — | Doc 01 F51 | P2 | S |
| I4 Personal authenticator setup (QR, confirm 6-digit code) | §4.20, §3.36 | partial | `SecuritySection.tsx` (enrol / verify / unenrol Supabase TOTP) | Recovery codes after confirm; doc 01 F52 | P1 | S |
| I5 Sign-in challenge, trusted device (30 days), account MFA policy page | §4.20, §7.10 | missing | No AAL2 check anywhere in `src/` | Doc 01 W9; Security admin page layout below | P1 | M |
| I6 Sessions and sign-in history | — (STORM) | placeholder | `SecuritySection.tsx` reads `user_sessions` / `login_history`, which nothing writes | Writer per doc 01 F50 | P2 | S |

**Coverage:** 73 features — complete 0, partial 25, placeholder 3, missing 45.

---

## Workflows & state machines

All transitions are executed by `SECURITY DEFINER` Postgres functions (or edge functions using the service role after checking the caller), never by a client `update` of a status column. Every transition writes an event row (actor, from, to, comment, at) and, where listed, emits a notification event through `emit_notification_event()`.

### 1. Notification pipeline (engine) — §3.24, §7.1, §8.9

```
domain RPC ──emit_notification_event()──▶ notification_events ──fan-out trigger──▶ user_notifications (in-app)
                                                   │
                                                   └──▶ notification_deliveries (email, status=pending, send_after)
                                                              │  notification-dispatcher (every minute)
                                                              ▼
                                         pending → sending → sent → delivered | bounced
                                                         └→ failed (retry ×3, backoff 1/5/30 min) → dead
```

**Event.** Emitted once per business event (e.g. "Permit PTW-2026-061 issued on Draak", "Quote awaiting approval on TKT-2026-0042"). Fields: type key, company, vessel (nullable for account-wide), module, entity type/id, human reference, title (≤ 120 chars), summary (≤ 280 chars, plain text), link path, actor, must-act user ids, sensitivity. Events are immutable.

**Recipient resolution** (in this order, de-duplicated per event × person):
1. **Must-act people** supplied by the domain (next signer, approver, assignee, the person a reminder is about). Always get an in-app item. Email per their preference; for types marked `is_mandatory` (e.g. "approval required", "permit overdue") email cannot be switched off by the person, only re-timed.
2. **Subscriptions** for the type whose vessel scope includes the event's vessel (or `all`). A subscription is a member or an external email address.
3. **Role audiences** declared on the type: `dpa` (DPA-flagged admins), `owner_admins` (owner + admins with the vessel in reach), `submitter_contributors` (support requests).
4. **Access re-check at send time**: a member who no longer reaches the vessel, or lacks read access to the module, is dropped. External addresses never receive types marked sensitive (medical, employment, payroll, GDPR, HR).
5. Personal in-app mute (`in_app_enabled = false`) suppresses the inbox item but not a mandatory email.

**Frequencies** (type default; a subscription or a person may override within the type's allowed list):

| Key | Behaviour |
|---|---|
| `immediate` | Sent within 1 minute, one email per event |
| `batch_15m` | Items for the same recipient collected for 15 minutes from the first item, then one email |
| `batch_held` | As `batch_15m`, but held outside the recipient's working hours (07:00–20:00 in their time zone) and sent at the next window opening |
| `every_2h` | One email every 2 hours if there is anything new |
| `daily` | One email at the recipient's digest time (default 07:00 local) |
| `weekly_mon` | Monday at digest time, list of items |
| `weekly_digest_mon` | Monday at digest time, counts per vessel and module with the top 10 items |

**Email content.** Subject "[Draak] PTW-2026-061 issued — Hot work, engine room". Body: title, vessel, reference, summary (omitted for sensitive types: "Open STORM to view"), primary button to the exact record (`/v/dra/safety/permits/<id>`), secondary "Why am I getting this?" → `/me/notifications` (or to the Notification Management row for external recipients, who get an unsubscribe link instead). Digests group by vessel, then module.

**Who manages.** Owner and admins with `notification_management.config`; an admin can add subscriptions only for vessels in their reach and only add members whose access covers that vessel. Every subscription change writes an audit row. People manage their own in-app and email toggles on `/me/notifications`; that page and the admin page write the **same** row, so a change in either place shows in both.

**Delete rules.** Events: kept 365 days, then purged by a nightly job (aggregates kept for counts). Inbox items: person can archive; purged with the event. Delivery log: 90 days.

### 2. Support request lifecycle — §4.13, §6.17 (superseded), §9

STORM status set (keys): `requested`, `awaiting_approval`, `approved`, `in_progress`, `testing`, `to_be_invoiced`, `complete`, `cancelled`. `in_progress` is a STORM addition (the reference used Testing for "being worked on" as well as "ready to verify", which hid whose move it was). Tabs: **Open** = requested, awaiting_approval, approved, in_progress, testing; **Completed** = to_be_invoiced, complete, cancelled. Tenant users see `to_be_invoiced` as "Complete · invoicing".

| From → To | Who | Rule / side effect |
|---|---|---|
| (new) → requested | Any active member (crew included) | Title 5–150 chars, details 15–10,000 chars, category required, priority default Normal, vessel default = current vessel scope or "All vessels", up to 10 attachments ≤ 50 MB each. Context captured: page path, vessel, role, app version, browser. Confirmation email to submitter (real) |
| requested → awaiting_approval | STORM staff | Sets a quote: amount > 0, currency (default USD), scope note ≤ 2,000 chars, optional estimate (days) |
| requested → in_progress / testing / complete | STORM staff | No cost. Complete needs a resolution note |
| requested → cancelled | Submitter, owner/admin, STORM staff | Reason required |
| awaiting_approval → approved | Owner or admin with `support_tickets.approve` and the request's vessel in reach ("the Company") | Confirmation dialog shows amount and scope; records approver, timestamp, amount snapshot |
| awaiting_approval → cancelled | Same as approve ("Decline and cancel") | Reason required; STORM notified |
| awaiting_approval → requested | STORM staff | Quote withdrawn |
| approved → in_progress → testing | STORM staff | |
| in_progress / testing → awaiting_approval | STORM staff | Scope change: new quote; previous approval kept in history; work pauses until re-approved |
| testing → complete | Submitter or owner/admin ("Confirm it works"), STORM staff, or the auto-complete job | Auto-complete after 14 days in Testing with no tenant reply, unless **Keep open** is on |
| testing → in_progress | Submitter or owner/admin ("Still not right") | Comment required |
| approved / testing / complete → to_be_invoiced | STORM staff | Only when an approved cost exists and is not waived |
| to_be_invoiced → complete | STORM staff | Invoice reference recorded |
| complete → in_progress | Submitter or owner/admin, within 14 days of completion, if not invoiced | "Reopen" with comment |

Rules: a request with an approved, un-waived cost cannot end in `complete` without passing `to_be_invoiced` (or a "no charge — defect fix" waiver by STORM staff). Editing title/details after `approved` is not allowed (comments only). **Whose move** is derived: tenant when status ∈ {awaiting_approval, testing} or the last public comment is from STORM and asks a question (flag on comment); STORM otherwise.

**Contributors.** Submitter is always a contributor. Owner/admins and the submitter can add members ("Add from this account") or external email addresses (notification only, no access) and remove them. Contributors get every public update, batched at 15 minutes.

**Discussion.** Markdown comments (≤ 10,000 chars) with Preview; STORM staff can post **internal notes** never visible to tenants. Edit own comment within 15 minutes (edit marker shown); no deletion except by STORM staff for abuse/PII, which leaves a "removed" marker.

**Read state.** Opening the detail marks it read for that person; the list shows an unread dot when the last public event is newer than the person's last read.

**Notifications.** `support_request_created` → STORM queue (immediate) + submitter confirmation; `support_quote_awaiting_approval` → owner/admins with reach (immediate, mandatory); `support_status_changed`, `support_comment_added` → submitter + contributors (batch_15m); `support_ready_to_verify` → submitter (immediate) with reminder after 5 and 12 days; `support_quote_approved` → STORM.

**Delete rules.** Tenants cannot delete requests; they cancel. STORM staff may hard-delete spam or test requests (audited). Attachments can be removed by their uploader while the request is open.

### 3. Company FAQ entry and suggestion — §4.14, §6.20

Entry states: `draft` → `published` → `archived`; STORM additions: `published` → `draft` (unpublish), `archived` → `draft` (restore).

- **Who:** owner and admins with `company_faq.edit`. Publishing requires `company_faq.publish` (granted with edit by default).
- **Validation:** category required (8 seeded categories, see Data model); order integer 0–9999, default 100 (lower first within a category); question 1–300 chars, unique per account (case-insensitive, warn not block); answer 1–20,000 chars Markdown (headings, bold, italic, lists, links to `https:`/`mailto:` or internal paths, code, images). Images: JPEG/PNG/WebP/GIF ≤ 5 MB, stored in a private bucket, rendered via signed URLs.
- **Save draft** stores without publishing; **Save & publish** makes it visible in the Help centre for this account only. Editing a published entry and saving republishes it and keeps the previous version in history (`faq_entry_versions`).
- **Delete:** drafts only; published entries must be archived. Archived entries disappear from the Help centre and search.
- **Notifications:** optional "Announce this update" on publish → in-app item to all members (`faq_published`) and the Help badge.

Suggestion states: `open` → `answered` | `dismissed`.

- Any member can suggest a question (text ≤ 300, optional page context captured).
- Admin **answers** by linking an existing published entry or by creating one (pre-filled with the question); the suggester is notified with a link. **Dismiss** with an optional note; suggester notified.
- A suggestion about STORM itself (not the company's procedures) can be **escalated to a support request** in one click.

Platform FAQs follow the same states, authored by STORM staff, visible to every account. A company cannot edit platform entries.

### 4. Add-on trial and subscription — §4.15, §6.22, §7.7

Per vessel × add-on: `off` → `trial` (start free trial: 90 days, only if `trial_used = false`) → `off_trial_used` (trial ends) ; `off` | `trial` | `off_trial_used` → `subscribed` ("Add"; billing starts, "appears on next invoice") ; `subscribed` → `off` ("Switch off").

- **Who:** owner and admins with `addons.admin` only (§4.15). Everyone with vessel access can **request** an add-on.
- **Autosave:** each action saves immediately with a toast and 10-second Undo (Undo within that window reverses without consuming the trial).
- **Rules:** one free trial per add-on per vessel, ever (archiving and restoring a vessel does not reset it). Starting a trial needs a typed confirmation for more than 5 vessels at once (bulk). Only counted vessels appear (§7.13), with "Showing n of n vessels".
- **Trial end:** nightly job moves expired trials to `off_trial_used`; module becomes locked (data retained; see open questions for read-only vs hidden). Reminders to owner/admins at 14, 3 and 0 days (`addon_trial_ending`).
- **Request flow:** "Request this add-on" on a locked module → `addon_requests` row (vessel, add-on, requester, optional note ≤ 500) → `addon_requested` notification to owner/admins (immediate) and an Activity item with "Open Add-ons" link; admin acts (trial/add) or dismisses with a note; requester notified.
- **Billing record:** every move into or out of `subscribed` writes an `addon_billing_events` row (vessel, add-on, from, to, price snapshot, effective date).

### 5. Data subject request — §4.18, §6.21

States: `open` → `extended` → `closed`; `open` → `closed`. Outcome on close: `fulfilled`, `partially_fulfilled`, `refused` (reason required, e.g. manifestly unfounded or excessive), `withdrawn`.

- **Record a request** (owner, DPA-flagged admins, admins with `gdpr.create`): who it is from (crew member, guest, occasional worker, job candidate, someone else); the person (search across current crew, past crew, candidates, occasional workers; or free-text name and contact if no record exists); request type (access, correction, erasure, restriction of processing, objection, portability); date received (not in the future, not more than 1 year ago); notes ≤ 5,000.
- **Due date** = one calendar month after the date received: the same day number in the next month, or the last day of that month if it has no such day (31 Jan → 28/29 Feb). Shown as a countdown chip (green > 7 days, amber ≤ 7, red overdue).
- **Extend** (DPA or owner): allowed only while open and before the due date; requires the date the person was told and the reason; new due date = three calendar months after receipt. The UI offers a letter template for the notice.
- **Identity verified** flag with date and method; the export action is disabled until set.
- **Type-specific actions** on the request page: Access / Portability → "Generate export" (workflow 6, linked to the request); Correction → link the corrected records (audit diff captured); Erasure → erasure plan (workflow 7); Restriction → set `processing_restricted` on the profile (banner on the crew profile; excluded from optional processing such as AI features and analytics exports); Objection → decision note.
- **Close** (DPA or owner): outcome, response date, summary. Closed requests are read-only; reopen within 30 days with reason.
- **Notifications** (audience `dpa`): recorded (immediate), due in 7 days, due tomorrow, overdue (daily until closed).
- **Delete rules:** requests are never deleted; kept 6 years after closure (account-configurable).

### 6. Personal data export — §4.18, §3.33

`requested` → `generating` → `ready` → `expired` (link) → `purged` (file); `failed` on error.

- Who: owner and DPA-flagged admins (`gdpr.export`, a T3 capability; requires a second factor at the moment of use once MFA is enforced).
- The `gdpr-export` edge function (service role, scoped to the caller's company) gathers every table that references the person (start from `gatherCrewData` in `useHrDashboard.ts` and extend to medical, payroll, bank, HoR, training, appraisals, signatures, support requests they raised, notification preferences) and writes a ZIP: `index.html` summary, one JSON and one CSV per section, and either the document files themselves (if total ≤ 500 MB) or a list of signed links valid **1 hour**.
- The download link itself is valid 1 hour; the file is deleted after 24 hours. Every generation and every download is a `data_protection_events` row ("Data export of <person> by <user>").

### 7. Retention, legal hold and erasure — §4.18, §6.21, §7.6

- **Keep-until** per past crew member and record type = last employment end date + the retention period from `data_retention_policies` (default 6 years for payroll and employment; other types per the account's policy).
- Retention item status: `retained` (keep-until in the future) → `due` (date passed) → `approved_for_deletion` (DPA approves in a batch) → `anonymised`. Any item for a person with an active **legal hold** shows `on_hold` and cannot move to deletion.
- **Legal hold** (DPA or owner): set on the crew profile with reason (≤ 500) and optional review date; release with reason. Both logged in Activity and notified to DPA-flagged admins.
- **Erasure request**: the plan lists each record group as "can be erased now" or "must be kept until <date> because <rule>" or "on legal hold". DPA approves; `gdpr_anonymise_person()` replaces identifying fields with placeholders, deletes documents from storage, keeps statutory records with the minimum identifiers, and logs a single Activity event.

### 8. Users & Access pages — §4.11, §6.24 (workflows W2–W8 in doc 01)

Page-level rules only; the invitation, access-change, Access Set, disable and view-as state machines are doc 01 W2, W3, W4, W7, W8.

**Vessel Crew tab.** Header "Users & Access — Manage crew access by vessel". Fleet-wide "Find a person" search (opens their person page whatever vessel). Vessel select (only vessels in the viewer's reach). List / Matrix toggle. Chips with live counts for the selected vessel: All, Custom only, Heads of Department, Can view medical, Can access employment, Payroll access, plus STORM's "Invite pending" and "Expiring grants". List columns: select; Name (On board / On leave / Joining chip, last active, Terms & Privacy accepted icon); Position; Crew access (set name or "Custom (closest: HOD +1 −2)", orange chips for medical view, medical edit, employment, transfers); Other modules (Safety, Certs, Tech, Vessel, Charter/Trip label, Finance as None / R / RW mini-chips); Actions (View as, Edit). Matrix: 17 columns as on `image42` with sticky header and first column, column groups (View / Approvals / Appraisals / Training), sort by Rank or Name, staged cells and a "n changes · Review & save" bar.

**Invite Admin form** (owner, or admin with "Can manage account administrators"):

| Field | Type | Rules |
|---|---|---|
| Email | email | Required; valid format; not already an active member (offer "Open their access" instead) |
| Full name | text | Required, 2–120 chars |
| Phone | country code + number | Optional; E.164 when stored |
| Vessels | multi-check | At least one; only vessels in the inviter's reach |
| Crew module access | select | View Only (default) / Head of Department / Full Access / an Access Set |
| Safety, Certificates, Technical, Vessel, Charter/Trip, Finance | select each | None (default) / Read only / Read & write; "Set all (except Payroll)" helper |
| Payroll | select | None (default); only enabled when Finance ≥ the chosen level |
| Users & Access level | select | No access (page hidden) / Read only / Read & write, for their vessels |
| Can manage account administrators | checkbox | Off by default |
| DPA | checkbox | Receives data-protection notifications; at least one DPA recommended (warning on the Data protection page if none) |
| Job role | select | Crew Manager, Fleet Manager, Fleet Operations, Managing Director, Operations Manager, Owner's Representative, Shore Purser, Superintendent, Technical Manager, Yacht Manager, Shoreside Logistics (tenant-extendable list) |

Invite Shore Staff uses the same form without Users & Access level, "manage admins" and DPA. Nothing is sent until the inviter presses **Send invitation** on a summary step that lists exactly what the person will see at first sign-in (ticket #40 theme).

**Account Admins tab** rows: name, email, job role, chips (Admin, Manages admins, DPA), vessels count, last active, Terms & Privacy, invite status; actions Manage permissions, Disable, Remove admin. **Shore Staff tab** rows: name, email, vessels, access (View only / set name / Custom), status, last active; actions Manage permissions, Assign to vessel, View as, Disable, Remove. Guards (doc 01 W7): no self-edit, owner untouchable, last "manages admins" admin cannot be removed.

### 9. Vessel Settings and Vessels pages — §4.16, §4.17 (doc 01 W5, W6)

**Vessel Settings matrix.** Rows = counted and inactive vessels (archived hidden unless filtered); columns in this order: Hours of Rest (toggle + "from" date picker; turning on defaults the date to today; the date cannot be later than 30 days ahead), Crew Training (toggle), Charter (label: Charter / Trip), Finance (toggle; locked with "Requires Finance add-on" when gated), Planner (label: Planner / Leave), MLC 2006 (toggle), Crew Uploads (toggle), Voice (toggle), plus STORM modules Electronic Logbooks, Departments and Health & Wellness (toggles). Each cell autosaves with a toast "Saved · Undo" (10 s). Clicking a vessel name opens the per-vessel page with one card per module explaining what switching it off hides (tab, widgets, calendar events, notifications) and that data is kept. Fleet-wide toggles sit above the matrix ("Safety Management Manual — Hidden on 10 of 10 vessels", edit opens per-vessel exceptions). Owner/admins only; audited.

**Vessels page.** Table: icon, name, code, type, flag, IMO, status chip (Active, Inactive — not counted, Archived), crew on board count; actions Open vessel (switches to `/v/<code>`; "Current vessel" label when already in it), Edit, Mark inactive, Archive (typed confirmation). "Add vessel" dialog: Vessel name (required, unique per account, ≤ 80), Vessel type (Motor Yacht, Sailing Yacht, Catamaran, Explorer Yacht, Superyacht, Mega Yacht, Commercial Vessel, Research Vessel, Other), Flag state (searchable list), IMO number (optional, 7 digits with check digit), MMSI (optional, 9 digits), Call sign (optional, 3–7 letters/digits), Code (3 letters, suggested from the name, editable until the first numbered record). On save, `create_vessel()` seeds defaults (doc 01 F13) and lands on the new vessel's Vessel Settings page.

### 10. Account and Security pages — §4.19, §4.20 (doc 01 W1, W9)

**Account page** cards: Fleet logo (JPEG/PNG/WebP ≤ 5 MB, preview on light and dark backgrounds, Choose / Remove); Account owner (read-only name and login, "Contact STORM support to change the owner" link that pre-fills a support request); Contact details (contact name, company name, phone with country code, address; Edit opens an inline form, explicit Save); Branding (display name, brand colour with contrast check, footer tagline); Data protection contact (DPA name, email, 24/7 phone — existing `companies.dpa_*`); Status (account status chip, registration date, read-only); Associated fleets (fleet groups list, link to Fleet Groups); Join a vessel as crew (vessel, position, department → creates a crew assignment for the current admin). Owner and admins with `account.config`.

**Security page (account policy)**: require an authenticator for owner and admins (default on), for shore staff, for holders of medical / employment / payroll / GDPR-export grants, or for everyone; trusted-device window 0–30 days (default 30); invitation expiry 1–30 days (default 7); session idle timeout. A table shows each member's authenticator status with "Reset authenticator" (owner or "manages admins" admin, reason required, person emailed). Personal setup stays on `/me/security`: Set up authenticator → QR + secret → confirm 6-digit code → show 10 recovery codes (download / copy, must tick "I have saved these") → done.

---

## Data model

All changes are additive. STORM conventions: `snake_case`, `company_id`, `vessel_id`, `created_by`, `created_at`, `updated_at`; RLS on every table; writes that change workflow state go through definer functions only.

| Entity | Key fields | Existing STORM table(s) or NEW | Notes |
|---|---|---|---|
| Notification type | key, name, description, module_key, category, default_frequency, allowed_frequencies text[], audience text[] (`must_act`/`subscribers`/`dpa`/`owner_admins`/`submitter_contributors`/`subject`), is_sensitive, is_mandatory, link_template, owner_domain, default_enabled, sort_order | `notification_types` + columns | Replace `cadence` CHECK with a `notification_frequency` enum (`immediate`, `batch_15m`, `batch_held`, `every_2h`, `daily`, `weekly_mon`, `weekly_digest_mon`); map realtime→immediate, daily→daily, weekly→weekly_mon |
| Notification subscription | id, company_id, notification_type_key, user_id or email, vessel_scope (`all`/`specific`), vessel_ids, frequency (nullable = type default), channels {in_app, email}, created_by | `notification_subscriptions` + `frequency` | Unique (company_id, type, coalesce(user_id, email)); write via `save_notification_recipients(type, rows)` in one transaction (fixes delete-then-insert loss); RLS by capability, not `has_role(dpa)` |
| Personal notification preference | user_id, notification_type_key, in_app_enabled, email_enabled, frequency_override, digest_time (on a per-user row) | `user_notification_preferences` + columns | The one personal store. Migrate `user_preferences.notification_channels / daily_digest_time / weekly_digest_*` then stop reading them |
| Notification event | id, company_id, vessel_id, module_key, type_key, entity_type, entity_id, reference, title, summary, link_path, actor_user_id, must_act_user_ids uuid[], is_sensitive, payload jsonb, created_at | NEW `notification_events` | Insert only via `emit_notification_event(...)` definer function; RLS select = vessel in reach and module readable; index (company_id, created_at desc), (vessel_id, module_key) |
| Inbox item | id, user_id, event_id, read_at, archived_at, created_at | NEW `user_notifications` | Fan-out trigger on `notification_events`; realtime publication for the bell |
| Email delivery | id, company_id, event_id(s) uuid[], recipient_user_id or recipient_email, frequency, send_after, status (`pending`/`sending`/`sent`/`delivered`/`bounced`/`failed`/`dead`), attempts, provider_message_id, error, sent_at | NEW `notification_deliveries`; `notification_logs` + `company_id`, `delivery_id` | Dispatcher claims rows with `FOR UPDATE SKIP LOCKED`; `notification_logs` stays the provider log for "Sent (90 days)" counts |
| Support request | id, company_id, reference (`TKT-YYYY-NNNN`), vessel_id (null = all vessels), title, details, category, priority, status, source (`form`/`quick`/`email`/`platform`), page_path, app_version, browser, reporter_role, submitted_by, keep_open, whose_move (derived), assignee_staff_id, resolution, completed_at, invoice_ref, last_public_activity_at | `support_tickets` + columns | Rename UI "subject" → title; new category set: `bug`, `how_to`, `access`, `data_correction`, `feature_request`, `configuration`, `billing`, `other` (map old: technical→bug, data→data_correction, access→access, feature→feature_request, training→how_to, other→other); new status set (workflow 2; map open→requested, in_progress→in_progress, resolved→testing, closed→complete); add `module_key` (auto-suggested from page path) |
| Support quote | id, request_id, amount_minor, currency, scope_note, estimate_days, status (`proposed`/`approved`/`declined`/`withdrawn`/`superseded`/`waived`), proposed_by, decided_by, decided_at, decision_note | NEW `support_request_quotes` | Latest non-superseded quote shown in the Cost block; history kept |
| Support comment | id, request_id, author_id (member or staff), body_md, visibility (`public`/`internal`), asks_question bool, edited_at, removed_at | NEW `support_request_comments` | Internal rows invisible to tenant RLS |
| Support event | id, request_id, actor_id, kind (`created`/`status_changed`/`quote_*`/`contributor_*`/`attachment_*`/`keep_open_*`), from_status, to_status, note, created_at | NEW `support_request_events` | Activity log on the detail page |
| Support attachment | id, request_id, storage_path, name, size, mime_type, uploaded_by, removed_at | NEW `support_request_attachments` | Private bucket `support-attachments`; path `company_id/request_id/uuid-name`; reuse legal path validation pattern |
| Support contributor | request_id, user_id or email, added_by, removed_at | NEW `support_request_contributors` | |
| Support read state | request_id, user_id, last_read_at | NEW `support_request_reads` | |
| Feedback submission | (legacy) | `feedback_submissions` (migration never applied live) | Retire; panel writes support requests with `source = 'quick'` |
| FAQ category | key, label, sort_order, is_active | NEW `faq_categories` | Seed (STORM wording, DECISIONS §7): First steps, People & crew, Safety & SMS, Maintenance & jobs, Voyages & operations, Documents, Access & accounts, Troubleshooting |
| FAQ entry | id, company_id (null = platform), category_key, sort_order (default 100), question (≤ 300), answer_md (≤ 20,000), status (`draft`/`published`/`archived`), module_key, related_paths text[], published_at, published_by, archived_at, search tsvector (generated), version, created_by, updated_by | NEW `faq_entries` | CHECK lengths; GIN index on `search`; RLS: published platform rows readable by all authenticated; company rows readable by members of that company when published, by editors in all states |
| FAQ version | entry_id, version, question, answer_md, saved_by, saved_at | NEW `faq_entry_versions` | |
| FAQ suggestion | id, company_id, question (≤ 300), page_path, vessel_id, suggested_by, status (`open`/`answered`/`dismissed`), answered_entry_id, response_note, handled_by, handled_at | NEW `faq_suggestions` | |
| Add-on | key, name, summary, includes text[], price_minor, currency, period (`vessel_month`), trial_days (90), learn_more_url, gated_module_keys text[], entitlement_key, is_active | NEW `addons` | Platform-managed |
| Vessel add-on state | id, company_id, vessel_id, addon_key, state (`off`/`trial`/`off_trial_used`/`subscribed`), trial_used, trial_started_at, trial_ends_at, subscribed_at, switched_off_at, updated_by | NEW `vessel_addon_subscriptions` | Unique (vessel_id, addon_key); writes only via `set_vessel_addon_state()` |
| Add-on billing event | id, company_id, vessel_id, addon_key, from_state, to_state, price_minor, currency, effective_at, actor_id | NEW `addon_billing_events` | Feed for invoicing |
| Add-on request | id, company_id, vessel_id, addon_key, requested_by, note, status (`open`/`actioned`/`dismissed`), handled_by, handled_at | NEW `addon_requests` | |
| Vessel / account module settings | per doc 01 | NEW `vessel_module_settings`, `company_module_settings` (doc 01) | Add `requires_addon_key` on module defaults |
| Data subject request | id, company_id, requester_kind (`crew`/`guest`/`occasional_worker`/`candidate`/`other`), subject_profile_id (nullable), subject_user_id (now nullable), subject_name, subject_contact, request_type, received_on, due_on, extended_due_on, extension_notified_on, extension_reason, identity_verified_at, identity_method, status (`open`/`extended`/`closed`), outcome, closed_on, response_summary, notes, requested_by (recorder), processed_by | `gdpr_requests` + columns | Keep `request_type` keys (UI label "Correction" for `rectification`); backfill `received_on` from `requested_at`, `due_on` from `deadline_date`; status map pending/in_progress→open, completed→closed+fulfilled, rejected→closed+refused |
| Data subject request event | id, request_id, actor_id, kind, note, created_at | NEW `gdpr_request_events` | Timeline |
| Data export | id, company_id, subject_profile_id, request_id, requested_by, status, storage_path, include_files bool, sections jsonb, size_bytes, link_expires_at, file_purge_at, created_at | NEW `gdpr_exports` | Private bucket `gdpr-exports`; downloads via edge function that logs each one |
| Legal hold | id, company_id, profile_id, reason, review_on, set_by, set_at, released_by, released_at, release_reason | NEW `crew_legal_holds` | Active = released_at IS NULL |
| Retention policy | record_type, retention_years, retention_trigger, require_dpa_approval_for_deletion | `data_retention_policies` (exists) | Add trigger value `last_employment_end` |
| Retention item | profile_id, vessel_id, record_type, keep_until, status | NEW view `retention_items` (+ table `retention_decisions` for approvals) | Computed from employment end + policy + holds |
| Data-protection event | id, company_id, vessel_id, kind (`export`/`export_download`/`legal_hold_set`/`legal_hold_released`/`permission_change`/`user_created`/`user_removed`/`bank_details_changed`/`request_recorded`/`request_closed`/`anonymised`), actor_id, subject_profile_id, summary, created_at | NEW `data_protection_events` | Append-only; inserted by triggers on `permission_audit_log`, `account_memberships` (doc 01), `crew_bank_details`, `crew_legal_holds`, `gdpr_exports`; no client INSERT policy |
| Access review | per doc 01 | NEW `access_reviews` | Snapshot CSV stored with the review |
| Sub-processor | name, purpose, region, sort_order | NEW `platform_subprocessors` | Platform-managed; shown on Overview |
| Account | per doc 01 (owner, status, contact, tagline, security policy jsonb) | `companies` + columns | DPA contact fields already exist |
| Platform staff | per doc 01 | NEW `platform_staff` | `is_platform_staff()` used by support and FAQ RLS |

### Notification type catalogue (minimum set this engine must ship with)

Owning domains add rows; keys here are proposals. Frequency = default. Audience in brackets.

- **Administration (this doc):** `support_request_created` immediate [staff, submitter]; `support_quote_awaiting_approval` immediate, mandatory [owner_admins]; `support_status_changed` batch_15m [submitter_contributors]; `support_comment_added` batch_15m [submitter_contributors]; `support_ready_to_verify` immediate [submitter]; `faq_published` daily [all members, opt-in]; `faq_suggestion_received` daily [faq editors]; `faq_suggestion_answered` immediate [subject]; `addon_requested` immediate [owner_admins]; `addon_trial_ending` immediate [owner_admins]; `addon_state_changed` daily [owner_admins]; `gdpr_request_recorded` immediate [dpa]; `gdpr_request_due_soon` immediate [dpa]; `gdpr_request_overdue` daily, mandatory [dpa]; `gdpr_export_generated` immediate [dpa]; `legal_hold_changed` immediate [dpa]; `sensitive_access_changed` immediate [dpa, subject]; `crew_transfer_recorded` immediate [dpa] (#96); `invitation_bounced` immediate [inviter]; `invitation_accepted` daily [inviter]; `access_review_due` weekly_mon [dpa, owner]; `vessel_module_changed` daily [owner_admins].
- **Safety (SMS docs):** checklist approval required (immediate), checklist completed, corrective action activity (batch_15m), corrective action overdue, HESS meeting due / overdue (weekly_mon), awaiting company sign-off (immediate, [owner_admins] — never "no recipients"), incident activity, other SMS form activity (batch_15m), permit to work issued / approved (immediate), permit overdue (every_2h), risk assessment activity (batch_15m), risk assessment approval required (immediate), safety meeting activity, crew handover activity, required reading published.
- **Certificates:** expiries (weekly_digest_mon), certificate uploaded / changed (batch_15m), verification decision (immediate).
- **Technical:** job awaiting approval (immediate), operational checklist approval required / completed, technical form activity, critical equipment defective (immediate), maintenance due / overdue (weekly_mon), low stock.
- **Crew / HR:** appraisal activity, employment agreement activity, leave request, hours-of-rest not submitted (subject reminder, #286), hours-of-rest breach (immediate to HoD and Master), training application activity, document expiring, crew changes.
- **Vessel:** departure / noon / arrival reports (immediate), voyage checklist approval required.

The registry must render in Notification Management with a "No recipients" warning for any type whose audience resolves to nobody on a vessel (the reference showed a company sign-off type with no recipients, §8.9).

---

## Improvements over the reference

Each item is tied to a theme from the reference app's support-ticket export where one exists (ticket numbers are the reference app's own).

1. **Requests carry their own context.** Support tickets in the reference were often started from a chat and had the user's role, vessel, contact and page pasted into the description as text (#325, #314, #313), while 109 of 142 were filed as "General" and 107 as "All vessels". STORM captures page path, vessel, role, app version and browser automatically, defaults the vessel from the current scope, suggests the module from the page, and replaces "General" with categories that route work (Bug, How do I…, Access, Data correction, Feature request, Configuration, Billing, Other).
2. **Whose move is always visible.** The reference reused "Testing" for both "being worked on" and "please check", and quotes sat in "Awaiting Approval" (6 open at export). STORM adds In progress, a "Waiting on you / Waiting on STORM" chip, reminders when a quote or a verification waits more than 5 days, and a sidebar badge that counts only requests waiting on the account.
3. **Quotes are explicit and auditable.** 74 reference tickets carried a cost (paid change requests). STORM keeps quote history, requires the approver to be the owner or an admin for that vessel, re-asks for approval if scope changes, and supports a "no charge — defect fix" waiver (a reference ticket shows a cost later marked "bug fixed not charged", #79).
4. **Answer before asking.** While a user types a new request title, STORM shows matching FAQs and similar open requests from the same account (FAQ section requested in #288 to cut support load). A search with no results offers "Suggest this as a FAQ" and "Contact support" in one place.
5. **Self-service for the biggest ticket themes.** Five reference tickets were about invitations not arriving or people unable to sign in (#325, #313, #282, #278, #120). STORM shows invite delivery and bounce status on the person row, offers resend with cooldown and "copy invite link", and turns "forgot password before accepting" into a re-sent invite (doc 01 W2). Access confusion (#138, #51) is answered by the effective-permission inspector.
6. **Configuration is a setting, not a paid ticket.** In the reference, hiding the Leave module (#10, charged), hiding unused technical items and templates (#12, #14), tenant branding (#136, charged), notification routing and preference changes (#79, quoted then waived as a defect fix), a per-person permissions grid (#146, charged) and named role badges (#147, charged) all went through paid tickets. STORM ships Vessel Settings (module on/off and labels), Account branding, Notification Management with per-person routing, the Users & Access Matrix and designated vessel roles (doc 01 F34) as self-service.
7. **Notifications that land on the record.** Email buttons open the exact record in the right vessel, with a short excerpt (#252). Every person can see what they are subscribed to and the last emails sent to them, so "I didn't get the email" (#163) becomes a look-up, not a ticket. External recipients never receive sensitive types.
8. **One setting, two windows.** The person's own preferences and the admin's Notification Management write the same row (a reference change, #79, had to retrofit this). Must-act notifications cannot be silently switched off, only re-timed.
9. **DPA hears about what matters, in one place.** Transfers, sensitive grants, exports, legal holds and request deadlines notify DPA-flagged admins (#96 asked for transfer notifications to the DPA; #142 asked for consolidated, DPA-sent notifications rather than automatic floods).
10. **Add-on requests are first-class.** A crew request for an add-on became a support ticket in the reference (#268). STORM records it as an add-on request, shows it in Activity with a one-click "Start trial", and tells the requester the outcome.
11. **Data protection that does the arithmetic.** Calendar-month deadlines computed correctly, extension rules enforced, countdown chips, a server-side export that includes everything (not limited by the exporter's own permissions), document files included when small enough, and an erasure plan that explains which records must be kept and why. The reference tracked requests and exports; STORM also runs retention and legal holds end to end.
12. **Help content the company controls, plus the platform's.** Company FAQs sit beside STORM's own FAQs in one search, with versions, suggestions and usage signals (searches with no result appear on the Suggestions tab as candidates).
13. **Errors never cost work.** A reference user reported error pages interrupting work and forcing restarts (#92). STORM's "Report a problem" attaches the last client error and screenshot automatically, and the app keeps form drafts so an error report never navigates away from unsaved input.
14. **One vessel count everywhere** (§7.13): Add-ons, Vessel Settings, Data held and dashboards all use the counted-vessel rule from doc 01.
15. **Consistent admin page pattern** (the aesthetic facelift): every Administration page uses the same frame — title and one-line purpose, KPI chips that double as filters, a filter bar (vessel, module, status, search), a dense table with sticky header and row actions, a right-hand drawer for detail, autosave pages showing "Saved · Undo" toasts and staged pages showing a "n changes · Review & save" bar (§7.12), empty states that name the next action, and orange reserved only for sensitive personal-data grants.

---

## Implementation notes

### Build order inside this domain

1. **Fixes with no UI dependency (S each):** `support_tickets` SELECT company check; stop claiming a confirmation email until one is sent; retire the feedback panel's writes (point it at support); `notification_subscriptions` RLS by capability; atomic `save_notification_recipients()`; authenticate callers of `send-email` (today it checks neither the caller nor that recipients belong to the caller's account; restrict to service-role callers and route all sends through the dispatcher).
2. **Notification engine (C1–C4, C9, C11):** events table, `emit_notification_event()`, fan-out, deliveries, dispatcher, templates, bell + `/inbox`. Other domains are blocked on this for their notification requirements (doc 02 X4 expects it).
3. **Admin shell (A1, A3)** and moves of existing pages to `/fleet/admin/*` with redirects.
4. **Support (D1–D4, D10, D11)**, then D5–D9.
5. **Data protection (H1, H2, H5, H6)**, then H3, H4, H9, H10, H7, H8.
6. **Company FAQs and Help centre (E1, E2, E4, E5)**, then E3, A2, E6.
7. **Add-ons (F3 entitlement first, because the permission engine needs it)**, then F1, F2, F4, F5, F6.
8. Users & Access, Vessel Settings, Vessels, Account and Security pages follow doc 01's build order.

### Files to reuse or extend

- **Notification Management**: keep `src/modules/notifications-admin/pages/NotificationManagementPage.tsx` (stat cards, chip filters, grouped list are the right shape); add a By person view and a Delivery log tab; replace `useSaveSubscriptions` (delete-then-insert) with an RPC; rebuild `EditSubscriptionDrawer.tsx` with a member picker (reuse `PeopleSelect.tsx` from `src/modules/legal/components/requests/`), vessel scope multi-select, frequency select and channel toggles. Extend `CadenceBadge.tsx` to the seven frequencies.
- **Bell and inbox**: the bell in `GlobalHeaderControls.tsx` / `DashboardLayout.tsx` should read `user_notifications` with a realtime channel (it already subscribes to `alerts` changes; same pattern). Merge `NotificationsPage.tsx` (preferences) into `/me/notifications` and `NotificationCenterPage.tsx` into `/inbox?tab=attention`; keep `useNotificationCenter.ts` for the attention tab. Replace `notificationLinks.ts` keyword routing with `link_path` from the event (keep it as a fallback for legacy alerts).
- **Dispatcher**: new edge function `supabase/functions/notification-dispatcher/`; reuse the Resend client and idempotency approach from `send-email/index.ts`; move templates into a shared module with two layouts (single item, digest). Schedule with `pg_cron` + `pg_net` or Supabase scheduled functions — the system audit (M8) found pg_cron jobs declared but never scheduled, so verify the schedule exists live.
- **Support UI**: build `src/modules/support/` (new module) and reuse from `src/modules/legal/`: `CommentThread.tsx` (already supports internal notes), `EventTimeline.tsx`, `AttachmentList.tsx` + `useLegalAttachments.ts` (private bucket, path validation; mirror `legal_attachment_path_allowed`), `StatusStepper.tsx`, `RequestFiltersBar.tsx`, `RequestTable.tsx`, `MarkdownEditor.tsx` / `MarkdownView.tsx` (safe hrefs, no raw HTML). Generalise these into `src/shared/components/requests/` rather than importing across modules. Keep the validation in `SupportPage.tsx` and turn it into the New request form; delete `src/modules/settings/components/sections/SupportSection.tsx` (mock). Fold `src/modules/feedback/components/FeedbackPanel.tsx` into a "Report a problem" sheet that calls the support create RPC; keep its auto-captured context fields; then delete `feedbackStore.ts`, `FeedbackAdmin.tsx` and the `/admin/feedback` route.
- **Help centre**: replace the hard-coded `GUIDE_CATEGORIES` in `HowToGuidesPage.tsx` with `faq_entries` (convert each guide into a platform FAQ seed row). Extend `src/modules/legal/lib/markdown.ts` with an image block (`![alt](storage:path)` resolved to a signed URL; only `storage:` and `https:` sources) and a `parseMarkdown` length guard. Use Postgres full-text search (`websearch_to_tsquery`) on a generated `tsvector`; no embeddings infrastructure exists in STORM today.
- **GDPR**: move `GDPRRequestsSection.tsx` and `DataRetentionSection.tsx` out of personal Settings into `src/modules/data-protection/` pages; extend `useGDPRRequests.ts` (calendar-month due date helper, record form, extend, close) and `useDataRetention.ts`. Port the table list in `gatherCrewData` (`src/modules/hris/hooks/useHrDashboard.ts`) into the `gdpr-export` edge function and make HRIS `DataGovernanceTab.tsx` link to the fleet page instead of exporting client-side. Write the calendar-month helper once in SQL (`add_calendar_months(date, int)`) and use it in both the due-date trigger and the UI.
- **Activity (H3)**: do not reuse `audit_logs` as is (no `company_id`, any signed-in user can insert). Create `data_protection_events` with triggers on the source tables; for `crew_bank_details`, add an AFTER UPDATE/INSERT/DELETE trigger that logs "bank details changed" without storing the values.
- **Add-ons**: implement `vessel_has_addon(vessel_id, addon_key)` and call it from `has_capability` (doc 01 F31) when a capability's `entitlement` is set. Note the PMS master prompt models entitlement per account; the reference model is per vessel, so the PMS addendum must change the signature to `(user, vessel, entitlement)`. Sidebar filtering in `SidebarNavigation.tsx` must also respect it so locked modules show the lock state rather than disappearing.
- **Account**: merge `BrandingSettings.tsx` and the real parts of `CompanyDetails.tsx` (drop `mockCompanyInfo` / `mockContacts`) into `/fleet/admin/account`; change `useBranding.uploadLogo` to accept JPEG/PNG/WebP ≤ 5 MB; replace `canManageBranding` (legacy `profiles.role`) with the account capability.
- **Capability catalogue** (`docs/permissions/catalogues/storm.json`, `fleet.administration`): extend `notification_management` to `view`, `config`; `support_tickets` to `view_own`, `create`, `view`, `edit`, `approve`, `cancel`; add `activity_feed` (`view`), `company_faq` (`view`, `create`, `edit`, `publish`), `addons` (`view`, `request`, `admin`), `vessel_settings` (`view`, `config`), `gdpr` (`view`, `create`, `export` (T3), `admin`), `security_policy` (`config`); move `admin.system.feedback` into support. Run `node scripts/permissions/check-storm-coverage.mjs` after.
- **Navigation**: add the Administration group to `src/config/sitemap.ts` (a `G('Administration', …)` under `fleetChildren`), remove `ADMIN_NAV_ITEMS` from `navigation.ts`, add the redirects listed in the IA to `src/routes/index.tsx`.

### Migration notes

- Hand-written migrations are not applied to production automatically (system audit H3; `feedback_submissions` never reached it). Each migration in this domain needs an explicit apply-and-verify step and a regenerated `src/integrations/supabase/types.ts` (grep it, never hand-edit).
- `support_tickets`: add columns; migrate categories and statuses with the maps in the Data model; keep `reference` and its trigger; add `GRANT UPDATE` only to the definer functions' owner, not to `authenticated`.
- `gdpr_requests`: drop NOT NULL on `subject_user_id`; add `subject_profile_id` FK to `profiles.id` (imported crew have no `user_id`); backfill as described; keep the old CHECKs until the UI ships, then replace them.
- `notification_types`: add columns with defaults, backfill `module_key` from `category`, then replace the `cadence` CHECK. Two migrations insert the same HR types (`20260917110000_*` and `20260917175040_*`); make seeds `ON CONFLICT (key) DO UPDATE` so reruns converge.
- `user_preferences`: copy notification fields into `user_notification_preferences`, then stop reading them (do not drop yet).
- Storage buckets `support-attachments`, `faq-images`, `gdpr-exports` must be created in migrations (private, with MIME and size limits), unlike `feedback-screenshots`, which never existed.

### Pitfalls

- Do not send notification emails from the browser. All sends go through the dispatcher so preferences, access re-checks, batching and logging apply.
- Re-check access at send time, not at subscribe time: people change vessels and grants after subscribing.
- Notification Management autosaves nothing; it uses explicit Save per row (like the reference's per-type editing). Vessel Settings and Add-ons autosave. Users & Access stages changes. Keep these three save behaviours distinct (§7.12).
- Calendar-month arithmetic must not use "+30 days" (the current `useGDPRRequests.createRequest` does).
- The client-side export in HRIS returns only what the exporter's RLS allows; a GDPR export built that way is silently incomplete. Use the service role inside the edge function, scoped by company, and log the caller.
- Support RLS must never use a bare `has_role(...)` without a company predicate (the current SELECT policy leaks across tenants).
- Internal support notes must be filtered in RLS, not only hidden in the UI.
- Markdown in FAQ answers and support comments is user-authored: render with `MarkdownView` (no `dangerouslySetInnerHTML`; the system audit lists three existing unsanitised HTML sinks to avoid copying).
- The reference shows company sign-off types configured with no recipients; STORM must warn on any mandatory type whose audience resolves to nobody for a vessel.

### Tests

- SQL tests (reuse the RLS harness pattern in `src/test/hris/harness.tsx`): support request visibility (submitter, contributor, admin with/without vessel reach, other tenant, STORM staff), every allowed and forbidden transition, quote approval by non-admin rejected; FAQ visibility by status and company; GDPR due-date helper (31 Jan, 29 Feb leap year, 30 Apr), extension rules; `vessel_has_addon` and the trial-once rule; dispatcher recipient resolution (access lost → dropped; sensitive → no external).
- Unit tests: frequency batching windows, digest grouping, deep-link builder, markdown image block sanitising.

---

## Open questions

1. **Paid change requests in Support.** Should STORM's support requests carry quotes and in-app approval (as the reference does for configuration and feature work), or should support stay free and feature work move to a separate commercial channel? This decides whether D5 and the `to_be_invoiced` state ship at all.
2. **Two-tier support.** Should crew requests go straight to STORM, or first to the account's own admins (internal helpdesk), who resolve or escalate them? The second reduces noise for STORM but adds a triage step for fleet admins.
3. **Request visibility.** Should shore staff and crew see every request raised for their vessel, or only their own and those they contribute to (proposed)?
4. **Which STORM modules are add-ons**, at what price per vessel per month, with what trial length, and is billing/invoicing handled in-app (and with which provider) or off-platform from the billing events export?
5. **After a trial ends** (or a subscription is switched off): is the module's data read-only for admins, or hidden entirely until re-subscribed? And does "Switch off" take effect immediately or at the end of the billing month?
6. **External email recipients** in Notification Management: allowed at all, and if so restricted to the account's email domains?
7. **Self-service data protection.** May crew submit access / correction / erasure requests themselves from their profile (creating a request the DPA must handle), or does only the DPA record requests (reference behaviour)?
8. **Export format.** Include document files in the export ZIP when under a size limit (proposed 500 MB), or only expiring links (reference)?
9. **Retention defaults** beyond payroll and employment (6 years): medical records, hours of rest, training, appraisals, support requests, notification events. These are DPA policy decisions per account; STORM needs defaults.
10. **Platform FAQs**: may an account hide individual platform FAQ entries from its Help centre?
11. **Auto-complete window** for requests in Testing: 14 days (proposed) or account-configurable?
12. Doc 01 open questions 1 (account owner), 2 (`shore_management` migration), 3 (company sign-off reach) and 6 (MFA defaults) also block pages in this doc.
