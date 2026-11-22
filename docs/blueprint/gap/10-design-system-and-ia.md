# Design system ("Abyss") and information architecture — gap analysis

> Domain 10 of the blueprint gap series. Docs 01–08 own the data, routes and workflows of each module; this doc owns **how STORM looks and how its navigation is organised**: the design tokens, the shell (top bar, scope switcher, tab bar, sidebars), the shared visual components, and the plan for moving ~2,700 hard-coded colour usages onto tokens. Route conventions follow doc 01 (`/fleet/…`, `/v/:vesselCode/…`, `/me/…`).

---

## Scope

**Blueprint sections covered:** §1.3 (two-level Fleet / Vessel structure), §1.4 (global top bar and footer), §1.5 (URL scheme), §4.1 (fleet dashboard layout: region maps, KPI tiles, expiry panels), §4.2 (tracker map layers), §4.3 (comparison tables), §4.11 (permission matrix layout), §4.16 (per-vessel module visibility and label overrides as they affect navigation), §4.19 (tenant logo), §5.1.2 / §5.1.8 / §5.2.1 / §5.2.3 / §5.6.1 (list, card-calendar, summary and record-list layouts seen in screenshots), §7.10 (favourites, help, voice), §7.12 (save-behaviour patterns as UI affordances), §7.13 (one counted vessel set), §8.8 (PDF anatomy, for the print theme rule only).

**Screenshots reviewed:** fleet dashboard, vessel comparison report, checklist builder, users-and-access matrix, crew list, hours-of-rest month cards, SMS summary, SMS forms list with type menu, voyage plans (blueprint images 38–46). The remaining embedded images are state diagrams (owned by other docs) or inline formula fragments.

**STORM paths inspected (read, not just listed):**

| Area | Files |
|---|---|
| Tokens and theme | `src/index.css`, `tailwind.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.css` (unused), `src/shared/contexts/BrandingContext.tsx`, `src/modules/settings/components/sections/AppearanceSection.tsx`, `src/components/ui/sonner.tsx` |
| Shell | `src/shared/components/layout/DashboardLayout.tsx`, `ModuleTopNav.tsx`, `SidebarNavigation.tsx`, `SidebarAccountMenu.tsx`, `NotificationBell.tsx`, `PageLocationHeader.tsx`, `InkfishFooter.tsx`, `FloatingQuickActions.tsx`, `VesselToggleBar.tsx`, `GlobalHeaderControls.tsx`, `HeaderQuickActions.tsx`, `AdaptiveActionBar.tsx`, `src/shared/components/InkfishWatermark.tsx`, `src/shared/components/common/PlaceholderPage.tsx` |
| Navigation config | `src/config/sitemap.ts`, `src/config/navigation.ts`, `src/config/navigation-types.ts`, `src/shared/lib/moduleNavigation.ts`, `src/routes/index.tsx`, `src/modules/{hris,health,legal,refit,new-build}/routes.tsx` and `paths.ts` |
| Vessel scope | `src/modules/vessels/contexts/VesselContext.tsx`, `src/modules/vessels/components/VesselSelector.tsx`, `src/modules/dashboard/contexts/DashboardFilterContext.tsx` |
| Visual components | `src/components/ui/{card,badge,button,table,tabs,dialog,sheet,drawer,alert-dialog,toast,chart,command}.tsx`, `src/modules/dashboard/components/fleet/{FleetKPITiles,RegionMapCard,VesselHealthMatrix}.tsx`, `src/modules/dashboard/pages/FleetMap.tsx`, `src/modules/itinerary/components/HeatMapTab.tsx` |
| Plans and audits | `.lovable/plan/module-navigation-aesthetic-update-2026-09-16.md`, `.lovable/plan/balanced-compact-layout-across-storm-2026-09-19.md`, `docs/SYSTEM-AUDIT-2026-09-19.md` (M6, M7, action 3.8 and the 19 Sep decision to introduce the Abyss vocabulary), sibling gap docs 01–07 |

### Audit findings at a glance

| Finding | Evidence |
|---|---|
| **Light theme is the only theme anyone sees.** A dark token block exists but nothing applies it at start-up. | `src/index.css` `.dark {…}`; `AppearanceSection.tsx` toggles the `dark` class only when the user presses Save; no theme provider in `App.tsx`; `sonner.tsx` calls `useTheme()` from `next-themes` with no provider mounted. |
| **The Abyss / Deep / Slate / Drift / Signal names do not exist in code.** | Grep of `src/` returns nothing; recorded in `SYSTEM-AUDIT-2026-09-19.md` line 285, decision recorded line 527. |
| **The declared font is never loaded.** `body` asks for Inter, but there is no font link, `@font-face` or font package, so every page renders in the OS fallback. | `src/index.css` body rule; `index.html` has no font link; `package.json` has no font package. |
| **Brand colour is computed and thrown away.** | `BrandingContext.tsx` writes `--brand-primary`; nothing reads it. |
| **Hard-coded Tailwind palette classes: 2,722 occurrences in 277 files** (of 815 `.tsx` files). Plus 243 hex literals in 33 files and 262 `dark:` variants in 50 files. Tokens already dominate (e.g. `text-muted-foreground` × 4,053), so the base is sound. | Grep counts in §C below. |
| **Status colours are re-invented per module.** 25 local `get…Color` / `…_COLORS` helpers; no shared status pill. | `src/modules/incidents/constants.ts`, `audits/constants.ts`, `training/constants.ts`, `risk-assessments/constants.ts`, `ism/pages/CorrectiveActionsPage.tsx`, `work-rest/components/NonConformityList.tsx` … |
| **The header holds only the workspace rail.** The notification bell and logo sit in the sidebar header (the bell disappears when the sidebar is collapsed); vessel scope is buried in the account menu at the bottom of the sidebar. | `DashboardLayout.tsx` lines 136–175 and 205–219; `SidebarAccountMenu.tsx` lines 41–145. |
| **No Fleet / Vessel split.** The top rail shows six workspaces (Fleet, Vessel, Shoreside, Health & Wellness, Yard, HRIS); vessel modules (Crew, Safety, …) are sidebar groups; the vessel is a global `localStorage` selection, not part of the URL. | `ModuleTopNav.tsx`, `sitemap.ts` `NAVIGATION_ITEMS`, `VesselContext.tsx` (`storm_selectedVesselId`). |
| **167 of 305 nav destinations are "Coming Soon" pages.** 262 sitemap leaves get a generated placeholder route; 95 are shadowed by real module routes, leaving 167 that render the placeholder: Vessel › Departments 68, Yard › Refit 38, Vessel › Safety 18, Certificates 11, Accounting 7, Technical 6, Vessel › General 6, Shoreside 8, Charter 3, Fleet 2. | Computed by bundling `sitemap.ts` and matching every leaf against the routes registered in `src/routes/index.tsx` and the module route files. |
| **Refit nav bug: 32 Refit sidebar links point at the wrong URL.** ``L('Dashboard', `${refitOverview}/dashboard`)`` appends the slug twice, producing `/yard/refit/overview/dashboard/dashboard`, which falls through to Coming Soon while the real page lives at `/yard/refit/overview/dashboard`. Same for every leaf under Overview, Workflow, Project, Documents, Finance, Compliance and Account & Admin. | `src/config/sitemap.ts` `yardRefit` (lines 450–505) vs `src/modules/refit/routes.tsx` lines 29–60. |
| **Dead shell code.** `VesselToggleBar.tsx` (the only file with arbitrary hex classes, a leftover dark palette), `GlobalHeaderControls.tsx`, `HeaderQuickActions.tsx` and `AdaptiveActionBar.tsx` are imported nowhere; `ADMIN_NAV_ITEMS` and `_unused_legacy` in `navigation.ts` are never rendered. | Grep for imports. |
| **Map styles disagree.** Fleet map uses a dark basemap, the dashboard region cards a light one, the itinerary heat map the default OSM style; Leaflet popups are hard-coded white. | `FleetMap.tsx:201` (`dark_all`), `RegionMapCard.tsx:29` (`light_all`), `HeatMapTab.tsx:120` (OSM), `index.css` Leaflet overrides. |

---

## Target information architecture (deliverable B)

### Principles

1. **Four scopes, one shell.** Every page belongs to exactly one scope, and the scope is visible in the top bar and the URL:
   - **Fleet** (`/fleet/…`) — oversight across all vessels the user can reach. Left sidebar, no tab row.
   - **Vessel** (`/v/:vesselCode/…`) — day-to-day work on one vessel. Module tab row under the top bar, plus a collapsible sidebar for the active module (§1.3).
   - **Workspace** (`/hris/…`, `/health/…`, `/yard/…`, `/legal/…`, `/shoreside`) — STORM-only departments that are neither fleet roll-ups nor single-vessel modules. Left sidebar (today's module tree), no tab row.
   - **Personal** (`/me/…`, `/inbox`, `/help/…`) — the signed-in person's own things. Minimal sidebar.
2. **Filing structure follows the reference, labels are STORM's.** Crews and shore staff moving between systems find Crew › Hours of Rest, Safety › Permits to Work, Vessel › Voyage Plans in the same place. STORM-only modules sit beside them, never inside them.
3. **The nav shows only what works.** Leaves with no real page are hidden, not shown as Coming Soon (a "Show roadmap" preference brings them back for owners/admins). Modules switched off for a vessel disappear completely (§4.16; tickets T-10, T-12, T-14, T-21).
4. **Labels can change, routes cannot.** Per-vessel label overrides (Charter ↔ Trip, Planner ↔ Leave) change the text only; route slugs stay English and stable.
5. **Data-driven sections stay data-driven.** Certificate sections, vessel document sections, logbooks and departments are generated from the database for the active vessel, not hard-coded in `sitemap.ts`.

### Top bar (both scopes, §1.4)

Height 56 px desktop / 52 px mobile; `bg-topbar` (Abyss-900 at 88 % with an 8 px backdrop blur), 1 px bottom border `border-sidebar-border`; sticky. In Vessel scope a 44 px **module tab row** sits directly below with the same background.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Tenant logo] │ [◆ Fleet │ ⛴ Draak ● ▾] [⋮⋮ Apps] │      [⌕ Search STORM…  ⌘K]  [★] [? •] [🔔 3] [AB ▾] │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Home  Crew  Safety  Certificates  Technical  Charter  Vessel  Logbooks  Calendar  Reports   ← Fleet ⚙ │  ← Vessel scope only
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Element | Behaviour | Visible to |
|---|---|---|---|
| 1 | **Tenant logo** | Account logo (max 28 px high, 140 px wide). Uses the "logo for dark backgrounds" if uploaded; otherwise the logo is placed on a light "plate" (rounded rectangle, `bg-white/92`, 4 px padding) so a dark-ink logo stays legible on Abyss. Falls back to the account display name in the display font. Click → the user's home (doc 01 landing rules). | all |
| 2 | **Scope control** (segmented, 36 px) | Left segment **Fleet**: goes to the fleet counterpart of the current page if one exists (Safety → `/fleet/safety`, Crew › Training → `/fleet/training`), else `/fleet/dashboard`. Right segment: **current or last vessel** in the display font, with an AIS state dot (Signal = underway, Drift = moored, hollow = position older than 6 h) and a compliance dot (worst open alert tone). Clicking the name enters that vessel; the chevron opens the **Vessel switcher**. Active segment: `bg-signal-muted text-primary` with a 1 px `primary/40` border. | Fleet segment only for users with fleet access; whole control collapses to a plain vessel label when the user has exactly one vessel and no fleet access |
| 3 | **Vessel switcher** (popover, `cmdk`) | Search box (name, 3-letter code, IMO); "All vessels — Fleet overview" row (fleet users); **Recent** (last 3); vessels grouped by fleet group; each row: name, code chip (`DRA`), open-alert count pill, AIS dot. Selecting a vessel **keeps the current sub-path** when that module is on for the new vessel (`/v/dra/safety/permits` → `/v/hyd/safety/permits`), else the module root, else vessel home. Lists only vessels in the user's reach; counts use the single "counted vessel" set (§7.13). Shortcut `g v`. | users with ≥ 2 vessels |
| 4 | **Apps** (grid icon) | Popover listing the workspaces the user can open: HRIS, Health & Wellness, Yard (Refit, New Build), Legal, Shoreside. Each tile: icon, name, one-line purpose. Inside a workspace the scope control shows a workspace chip (e.g. `HRIS`) instead of the vessel segment highlight. | users with access to ≥ 1 workspace |
| 5 | **Search / command palette** | Trigger looks like an input (280 px at ≥ 1280 px, icon below). ⌘K / Ctrl-K opens a `cmdk` dialog: pages (from the nav tree the user can see), vessels, people (crew, visitors, guests), records by reference (`PTW-2026-061`, `INC-2026-011`, `DRA-20261103-037`), and actions ("New departure", "Report incident"). | all |
| 6 | **Favourite** (star) | Toggles the current page as a favourite (filled Signal star when pinned). Its menu lists favourites and replaces today's floating quick-action button. Backed by `user_pinned_shortcuts`. | all |
| 7 | **Help** (?) with dot badge | Popover: search, top FAQs for the current module, Help centre, Contact support, Report a problem (doc 03). Badge = unread help/changelog items. | all |
| 8 | **Notifications** bell with count | Popover of the latest 20 + "Open inbox" (`/inbox`). Badge is `critical` when any unread item is critical, otherwise `primary`. Moves out of the sidebar header (today it vanishes when the sidebar collapses). | all |
| 9 | **Account** (avatar, initials on Slate-900) | Name, user kind, job role and current vessel; My profile, Security, Signature, Appearance (Theme: Dark / Light / System; Density: Comfortable / Default / Compact), Keyboard shortcuts, Sign out. While impersonating, the whole top bar turns `warning-muted` with "Viewing as <role> · End" (doc 01). | all |
| — | Voice input (reference mic icon, §7.10) | Not in this phase (Open question 8). | — |

**Module tab row (Vessel scope).** Tabs in this order, filtered by the vessel's module settings and the user's capabilities: Home · Crew · Safety · Certificates · Technical · Charter (or "Trip") · Vessel · Logbooks · Finance · Departments · Calendar · Reports. Right side: "← Fleet" link (fleet users) and a cog to `/fleet/admin/vessel-settings/:vesselCode` (owner/admins). Active tab: Signal text, 2 px Signal underline with a soft glow, sliding between tabs (reuse the indicator logic in `ModuleTopNav.tsx`). Locked add-on modules show a lock icon and open an explanation card (doc 03). Overflow: horizontal scroll with snap on narrow screens, and a "More ▾" menu at ≥ 768 px when tabs do not fit.

**Footer.** Keep `InkfishFooter.tsx` at the bottom of the content column (tagline from Account settings, Help, Support, Privacy, Terms, copyright) in `text-drift-500` at 12 px.

### Fleet view (`/fleet/…`) — left sidebar

Sidebar width 248 px (64 px collapsed), `bg-sidebar` (Abyss-950). Non-collapsible **section headings** (eyebrow style, 11 px uppercase, Drift-500) separate groups, as in the reference's "OPERATIONS / VESSEL RECORD / ADMINISTRATION" pattern.

```
FLEET
OVERVIEW
  Dashboard ................... /fleet/dashboard                       (doc 02)   §4.1
  Tracker ..................... /fleet/tracker                         (doc 02)   §4.2
  Reports ..................... /fleet/reports, /fleet/reports/:key    (doc 02)   §4.3
  Calendar .................... /fleet/calendar                        (doc 02)   §4.4
  Planner ..................... /fleet/planner                         (docs 04, 07: rotation + season planner)
  Safety queue ................ /fleet/safety                          (doc 05: whose-move inbox for the Company)
COMPLIANCE
  Documents ................... /fleet/documents                       (doc 02)   §4.5
  Forms & Checklists .......... /fleet/forms, /fleet/forms/:area       (doc 02)   §4.6
PEOPLE
  Training .................... /fleet/training/:tab                   (doc 02)   §4.7
  Medical ..................... /fleet/medical                         (doc 02)   §4.8
  Visits ...................... /fleet/visits/:tab                     (doc 02)   §4.9
  Employment .................. /fleet/employment/:tab                 (doc 02)   §4.10
WORKSPACES  (STORM; same entries as the Apps menu)
  HRIS ........................ /hris/…
  Health & Wellness ........... /health/…
  Yard ........................ /yard/refit/…, /yard/new-build/…
  Legal ....................... /legal/…        (today /departments/legal; redirect)
  Shoreside ................... /shoreside
ADMINISTRATION  (owner, admins, and shore staff holding an admin capability)
  Users & Access .............. /fleet/admin/users/:tab                (docs 01, 03)  §4.11
  Notifications ............... /fleet/admin/notifications/:tab        (doc 03)  §4.12
  Support ..................... /fleet/admin/support      [badge]      (doc 03)  §4.13
  Company FAQs ................ /fleet/admin/faqs                      (doc 03)  §4.14
  Data protection ............. /fleet/admin/gdpr/:tab                 (doc 03)  §4.18
  Account ..................... /fleet/admin/account                   (docs 01, 03)  §4.19
  Security .................... /fleet/admin/security                  (docs 01, 03)  §4.20
CONFIGURATION  (same audience; split from Administration so neither list exceeds 8)
  Vessels ..................... /fleet/admin/vessels                   (doc 01)  §4.17
  Vessel Settings ............. /fleet/admin/vessel-settings[/:vc]     (docs 01, 03)  §4.16
  Fleet Groups ................ /fleet/admin/fleet-groups              (doc 01)
  Add-ons ..................... /fleet/admin/add-ons                   (doc 03)  §4.15
  Certificate catalogue ....... /fleet/admin/certificates              (doc 06)
  Job library ................. /fleet/admin/job-library               (doc 06)
  Suppliers ................... /fleet/admin/suppliers                 (doc 06)
  Integrations ................ /fleet/admin/integrations              (today /admin/integrations)
  Feedback inbox .............. /fleet/admin/feedback                  (today /admin/feedback)
```

### Vessel view (`/v/:vesselCode/…`) — tab row + per-module sidebar

Detailed sub-trees are owned by docs 04–07; the table fixes the tab order, the sidebar section headings and where each STORM-only leaf goes.

| Tab (label) | Root route | Sidebar (section headings in CAPS) | Owner |
|---|---|---|---|
| **Home** | `/v/:vc` | none (vessel dashboard: KPI tiles, expiring items, whose-move list, position card) | doc 02 (vessel counterpart) |
| **Crew** | `/v/:vc/crew` | Dashboard · Crew List · Planner ("Leave") · Crew Compliance · Hours of Rest · Crew Medical · Crew Training · Familiarisation · Checklists · Performance Appraisals · Visitors & Occasional Workers · Employment History | doc 04 |
| **Safety** | `/v/:vc/safety` | Summary · Safety Management Manual · Drills · Permits to Work · SMS Forms · Observations · Checklists · Risk Assessments · Emergency · VESSEL DOCUMENTS ▸ (data-driven sections) · FLEET DOCUMENTS ▸ · Settings | doc 05 |
| **Certificates** | `/v/:vc/certificates` | Status Summary · one leaf per certificate section (data-driven) · Settings | doc 06 |
| **Technical** | `/v/:vc/technical` | Overview · Jobs · Maintenance Periods · Surveys · Equipment · Inventory · Purchase Orders · Rounds · Forms & Checklists · Documents & Plans · Deck Plans (add-on) · Viewers · Settings — sub-modules hidden when switched off | doc 06 |
| **Charter** / **Trip** | `/v/:vc/charter` | Charters · Planner · Guest List · Checklists | doc 07 |
| **Vessel** | `/v/:vc/vessel` | OPERATIONS: Voyage Plans · Tracking · Voyage Checklists — VESSEL RECORD: Details · Communications · Emergency Contact · Documents — ADMINISTRATION: Management Company · Owner & Employer · Flag & Class · Insurance · Billing · Settings | doc 07 |
| **Logbooks** (STORM) | `/v/:vc/logbooks` | Logbooks (list) · one leaf per logbook in the vessel registry (data-driven; replaces the hard-coded "DAGON Engine Room Log" leaf) · Review & Sign-off · Records & Exports — ADMINISTRATION: Registry · Connections · Assurance | this doc (moves today's `/vessel/logbooks/*`) |
| **Finance** (STORM; on when the vessel's Finance module is on, §4.16) | `/v/:vc/finance` | Overview · Expenses · Invoices · APA · Budgets & Reporting · cross-links: Payroll, Gratuities → HRIS Compensation | this doc (today Vessel › Accounting, 7 placeholders) |
| **Departments** (STORM; hidden until at least one department page is live) | `/v/:vc/departments/:dept` | one group per enabled department (Bridge, Deck, Engineering, Interior, Galley, Media, IT, Dive) with Handover · Work Lists · Rotas & Watchkeeping · Inventory & Equipment · Checklists · Reference; Spa and Medical cross-link to Health | this doc (today 68 placeholders) |
| **Calendar** | `/v/:vc/calendar` | none | doc 07 |
| **Reports** | `/v/:vc/reports`, `/v/:vc/reports/:slug` | none (category filter chips on the page) | doc 07 |

**Where today's extra Vessel leaves go**

| Today (`sitemap.ts`) | Target |
|---|---|
| Safety › Vessel Specific Manuals, Crew Duties & Responsibilities, Standing Orders (2), Muster List, Safety Documents, SOPs (6), Pollution, Flag Policy & Advice, Agent Information, NTVRP / OPA 90 (18 placeholders) | Seeded **Vessel Documents sections** (doc 05) with these names; they appear under Safety › VESSEL DOCUMENTS ▸ once a section has a document |
| Certificates › 11 static sections (placeholders) + "Fleet Certificates" → `/certificates` | Data-driven certificate sections (doc 06); "Fleet Certificates" moves to `/fleet/reports/fleet-certificates` |
| Vessel › Departments › Management / Office: HR, Management Company, DPA / ISM Office, Procurement, Finance / Accounts, Legal, Insurance, Crewing & Recruitment | HR → HRIS workspace; Management Company, Insurance → Vessel › ADMINISTRATION; DPA / ISM Office → `/fleet/safety`; Procurement → Technical › Purchase Orders; Finance / Accounts → Finance tab; Legal → Legal workspace; Crewing & Recruitment → Fleet › Employment. The Management / Office group is removed. |
| Vessel › Accounting (7 placeholders) | Finance tab (above) |
| Vessel › Electronic Logbooks | Logbooks tab (above) |
| Fleet › Fleet Scheduler (placeholder) | Removed (doc 02); season planning lives in `/fleet/planner` |
| Fleet › Notification Center (`/notifications/center`) | `/inbox?tab=attention` (doc 03) via the bell |

### Workspaces (STORM-only)

| Workspace | Root | Sidebar | Notes |
|---|---|---|---|
| HRIS | `/hris` | unchanged (`hrisChildren`) | Vessel crew pages link into HRIS person records and back (doc 04). |
| Health & Wellness | `/health` | unchanged (`healthChildren`); Medical leaves gated `medical`, wellness leaves `wellness`, self-serve leaves visible to crew | Crew with self-serve access reach it from Apps; fleet medical roll-up stays `/fleet/medical`. |
| Yard | `/yard` | Refit, New Build groups (fix Refit leaf paths, see IA11) | Refit and New Build keep their own project pickers inside the workspace. |
| Legal | `/legal` (redirect from `/departments/legal/*`) | Dashboard · Requests · Documents · Forms (`LEGAL_TABS`) | Open question 6 (route rename). |
| Shoreside | `/shoreside` | one landing page of service cards (8 services) instead of 8 Coming Soon leaves | Open question 5. |

### Personal and global

```
/me                     profile            /me/security        /me/signature       /me/appearance
/me/notifications       own preferences    /me/documents       /me/hours-of-rest   /me/leave   /me/training
/inbox?tab=inbox|attention                 /help, /help/faqs/:id, /help/requests[/:ref|/new]
```

### Nav visibility rule (applies to every leaf)

A leaf renders when **all** of these hold, evaluated in this order: (1) leaf status is `live` or `beta` (or `planned` and the viewer has "Show roadmap" on); (2) the scope's guard passes (vessel reach for Vessel scope, fleet access for Fleet, workspace access for Workspaces); (3) the vessel's module setting for the leaf's module is on (and, for Hours of Rest, today ≥ the enabled-from date); (4) the user holds the leaf's capability at `minPermission`. Add-on leaves that fail only the entitlement check stay visible with a lock icon. A group with no visible children is hidden. Labels resolve last from `vessel_module_settings.label_override`.

---

## Feature inventory

Status key: complete / partial / placeholder / missing. Effort: S < 1 day, M 1–3 days, L 3–10 days, XL > 10 days.

### A. Design system

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| DS1 | Abyss raw colour scales (Abyss, Deep, Slate, Drift, Signal) + status families | — (owner decision, SYSTEM-AUDIT action 3.8) | missing | — | Add the scale variables in §A.1 to `src/index.css` and expose them in `tailwind.config.ts` under `abyss`, `deep`, `slate-ui` (avoid clashing with Tailwind's `slate`), `drift`, `signal` | P0 | S |
| DS2 | Semantic shadcn tokens remapped to Abyss, dark as default | — | partial | `src/index.css` `.dark` block (navy 222 47 %, bright blue primary) | Replace every value with §A.2; fix `accent` semantics (hover surface, not brand blue); make `secondary` neutral | P0 | S |
| DS3 | Optional light theme ("Daylight") | — | partial | `src/index.css` `:root` (current light maritime theme) | Replace with §A.2 light column; keep the sidebar dark in both themes (Open question 2) | P1 | S |
| DS4 | Theme runtime: dark default, light, system; no flash; persisted | — | partial | `AppearanceSection.tsx` (`user_preferences.theme`, applied only on Save); `sonner.tsx` uses `next-themes` without a provider | Mount `ThemeProvider` (`next-themes`, `attribute="class"`, `defaultTheme="dark"`, `enableSystem`, `storageKey="storm-theme"`); inline pre-paint script in `index.html`; sync to `user_preferences` on change and on sign-in | P0 | S |
| DS5 | Tenant branding on a dark shell (logo, display name, tagline, brand colour) | §1.4, §4.19 | partial | `BrandingContext.tsx` (`client_logo_url`, `brand_color`, `client_display_name`); logo rendered in the sidebar header | Logo moves to the top bar; add "logo for dark backgrounds" and footer tagline; logo plate fallback; brand colour used only for the logo plate edge and PDF accents (never replaces Signal, Open question 1) | P2 | S |
| DS6 | Fonts actually loaded | — | partial | `index.css` asks for Inter; nothing loads it | Load Inter, Barlow Semi Condensed and JetBrains Mono (Google Fonts families, self-hosted via `@fontsource` packages for offline / VSAT use); `fontFamily` keys `sans`, `display`, `mono` | P1 | S |
| DS7 | Type scale and tabular numerals | — | partial | ad-hoc sizes; `tabular-nums` in ~90 places (mostly HRIS, Refit) | Scale tokens (§A.3); `tnum` on by default in tables, KPI values, date/number cells; slashed zero for coordinates and IMO | P1 | S |
| DS8 | Radius, elevation and glow tokens for dark surfaces | — | partial | `--radius: .5rem`; `shadow-card`, `shadow-card-hover`, `shadow-navbar` tuned for white cards | §A.4 tokens (`e1`–`e3`, `glow-signal`, inner top highlight) | P1 | S |
| DS9 | Motion tokens and reduced-motion policy | — | partial | keyframes `fade-in`, `slide-in-left`, `pulse-soft`; `motion-safe:` in sidebar | Duration/easing tokens (§A.6); global `prefers-reduced-motion` rule | P2 | S |
| DS10 | Focus ring standard | — | partial | most primitives use `ring-ring` + offset; sidebar uses `ring-sidebar-ring` | One `focus-ring` utility: 2 px Signal ring, 2 px offset in the surface colour; never removed | P1 | S |
| DS11 | Density modes | — | partial | `.storm-compact` class overrides in `index.css` (balanced compact plan) | `data-density` attribute (comfortable / default / compact) driving row heights and paddings via tokens; per-user preference; record pages default to comfortable on tablets | P2 | M |
| DS12 | Status pill + status registry (incl. whose-move chip and expiry tiers) | §6 (all state machines), §6.2, §1 exec summary engine 1 and 3 | missing | 25 local colour helpers; `badge.tsx` has only default / secondary / destructive / outline | `<StatusPill tone>` and `statusTone(domain, status)` registry (§A.8); whose-move chip; expiry tier pill | P0 | M |
| DS13 | KPI tile | §4.1, §5.2.1 | partial | `FleetKPITiles.tsx`, `KPITiles.tsx`, `AlertKPITiles.tsx` (raw amber/sky/emerald/rose palettes, 36 + 21 + 16 palette hits) | `<KpiTile>` (§A.9) with explicit loading / zero / not-enabled states | P0 | S |
| DS14 | Data table standard | §4.3, §5.1.2, §5.2.3 | partial | `components/ui/table.tsx` (plain); every page rolls its own sorting and filters | `<DataTable>` (§A.10): sticky header, sort, count chips, density, row selection, virtualisation via `@tanstack/react-virtual` (already a dependency) | P0 | M |
| DS15 | Matrix grid (people × flags, crew × qualifications, drills × months, vessels × modules) | §4.11, §4.16, §5.1.7, §5.2.6 | partial | each matrix page custom (`TrainingMatrixTab.tsx`, `VesselHealthMatrix.tsx`, permission editors) | `<MatrixGrid>`: sticky first column and header, rotated or wrapped column labels, column groups, crosshair hover, staged-edit footer ("Review & save", §7.12) | P1 | M |
| DS16 | Empty, loading, error and not-enabled states | — | partial | `PlaceholderPage.tsx`, `LazyLoader.tsx`, `ErrorBoundary.tsx` | `<EmptyState kind="first-use \| filtered \| not-enabled \| no-access \| error">` and skeleton patterns (§A.12) | P1 | S |
| DS17 | Map theming (basemap, markers, tracks, popups, layer switcher) | §4.1, §4.2, §5.6.4 | partial | `FleetMap.tsx` (dark basemap), `RegionMapCard.tsx` (light), `HeatMapTab.tsx` (OSM), white Leaflet popups in `index.css` | Shared `mapTheme` helper following the active theme; marker and track spec (§A.11); nautical overlays (seamarks, bathymetry) in the layer switcher | P1 | S |
| DS18 | Chart palette | §5.8, §4.3 | partial | `--chart-1..6` (blue-first light palette); `components/ui/chart.tsx` | Validated Abyss palette (§A.2, chart rows); axis, grid and tooltip tokens | P1 | S |
| DS19 | Primitives restyled (overlay, menus, dialogs, tabs, toasts, inputs) | — | partial | `dialog.tsx`, `sheet.tsx`, `drawer.tsx`, `alert-dialog.tsx` use `bg-black/80`; `toast.tsx` uses red palette classes; `tabs.tsx` pill style | Overlay token, `e2`/`e3` elevation, underline tabs with Signal indicator, toast tones from status tokens, 3:1 input borders | P0 | S |
| DS20 | Hard-coded colours moved onto tokens | — | partial | 2,722 palette-class occurrences / 277 files; 243 hex literals / 33 files | Codemod + manual review per module (§C) | P0 shell, P1 modules | L |
| DS21 | Palette ratchet (test that stops new hard-coded colours) | — | missing | `eslint.config.js`; `src/test/` | `src/test/design/paletteRatchet.test.ts` with a per-file baseline that may only go down; allow-list for PDF / email / data colours | P1 | S |
| DS22 | First paint, recovery and sign-in screens on Abyss | — | partial | `index.html` placeholder and watchdog (`#0066CC`, `#64748b`, white page); `main.tsx` recovery panel; `Auth.tsx`, `ResetPassword.tsx` | Dark first paint (no white flash at sea at night), tokens in the inline styles, `theme-color` meta, redesigned sign-in | P1 | S |
| DS23 | Print and PDF stay light | §8.8 | partial | `PrintBook.tsx` (`bg-white text-black`), jsPDF generators (`logbookPdf.ts`, `payslip.ts`, `reviewPdf.ts`, `pdfTemplate.ts`) | `@media print` forces the light token set; PDF constants derived from the light palette with Signal-700 as accent | P2 | S |
| DS24 | Watermark and footer | §1.4 | complete | `InkfishWatermark.tsx`, `InkfishFooter.tsx` | Restyle only: watermark rendered as a light silhouette at ~3 % on dark; footer in Drift-500 | P2 | S |
| DS25 | Timeline / planner visual tokens (weekend tint, today line, bars by category) | §5.1.6, §5.5.4 (T-27) | partial | `rotation-planner/constants.ts`, `crew/leaveConstants.ts`, `new-build/components/schedule/GanttChart.tsx` (hex category colours) | `--weekend`, `--today` tokens; category colours from the chart palette; remembered zoom | P2 | S |
| DS26 | Iconography | — | complete | `lucide-react` throughout | Rules only: 16 / 18 / 20 px, stroke 1.75, fixed module icon set (§A.3) | P2 | S |

### B. Shell and navigation

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| IA1 | Shell with four scope modes (Fleet, Vessel, Workspace, Personal) | §1.3, §1.5 | partial | `DashboardLayout.tsx` (one mode), `ModuleTopNav.tsx` (six workspaces), `VesselContext.tsx` (global selection) | `AppShell` with `scope` prop; route trees per doc 01 (`VesselScopeRoute`); legacy redirects. Router contract owned by doc 01 F14 | P0 | L |
| IA2 | Global top bar | §1.4 | partial | header contains only the hamburger and `ModuleTopNav`; logo and bell in the sidebar header; scope and account in `SidebarAccountMenu.tsx` | New `TopBar` with the nine elements above | P0 | M |
| IA3 | Fleet / Vessel toggle | §1.3, §1.4 | missing | — | Segmented scope control with counterpart mapping | P0 | S |
| IA4 | Vessel switcher | §1.4 | partial | `SidebarAccountMenu.tsx` (radio list), `VesselSelector.tsx` (searchable, unused, mock severity and fleet-group filters), `VesselToggleBar.tsx` (dead, hex colours), `DashboardVesselFilter` via dead `GlobalHeaderControls.tsx` | One `VesselSwitcher` (cmdk) that navigates; recent list; fleet groups; AIS and alert dots; sub-path preservation | P0 | M |
| IA5 | Vessel module tab row | §1.3 | missing | `ModuleTopNav.tsx` shows workspaces, not vessel modules | `ModuleTabBar` reusing the sliding indicator and density logic; "← Fleet" and settings cog; overflow menu | P0 | M |
| IA6 | Sidebar section headings | §1.3 (screenshot 45) | partial | `SidebarNavigation.tsx` supports collapsible groups only | `kind: 'section'` nav nodes rendered as non-interactive eyebrow headings | P1 | S |
| IA7 | Fleet sidebar restructured | §1.3 | partial | `sitemap.ts` `fleetChildren` (14 flat leaves; 2 placeholders; "Account" opens personal settings) | Tree above; Administration and Configuration groups; badges | P0 | S |
| IA8 | Apps switcher for STORM workspaces | — | missing | workspaces are top-rail items today | Apps popover + fleet sidebar group; workspace chip in the scope control | P1 | S |
| IA9 | Per-vessel module visibility and labels drive the nav | §1.3, §4.16 | missing | — (data model owned by doc 01 F11) | Nav resolver reads `vessel_module_settings`; hides off modules; applies label overrides; Hours of Rest "on from" date | P0 | S |
| IA10 | Coming Soon leaves hidden | — | placeholder | 167 effective placeholder destinations (see audit) rendered via `PLACEHOLDER_LEAVES` → `PlaceholderWrapper` | `status: 'planned'` on leaves; hidden unless "Show roadmap"; routes kept so bookmarks do not 404 | P0 | S |
| IA11 | Refit leaves point at the built pages | — | partial | `sitemap.ts` `yardRefit` builds `/yard/refit/<group>/<slug>/<slug>` for 32 leaves | Pass `existing` (or a base without the slug) for every Refit leaf; add a sitemap test that rejects repeated consecutive segments and leaves that resolve to a placeholder while a real route exists | P0 | S |
| IA12 | Command palette (⌘K) | §7.10 (help, favourites) | missing | `components/ui/command.tsx` and `cmdk` installed but unused in the app | Palette over pages, vessels, people, record references and actions | P1 | M |
| IA13 | Favourites (star) | §1.4, §7.10 | partial | `usePinnedShortcuts.ts` (`user_pinned_shortcuts`), `FloatingQuickActions.tsx` (floating button) | Star in the top bar; favourites menu; retire the floating button | P1 | S |
| IA14 | Help entry with badge | §1.4 (T-288) | partial | footer Help / Support dropdowns; `/help/*` pages | Top-bar Help popover (content owned by doc 03) | P1 | S |
| IA15 | Notifications bell in the top bar | §1.4, §7.1 | partial | `NotificationBell.tsx` in the sidebar header, hidden when collapsed | Move to the top bar; critical-tone badge | P0 | S |
| IA16 | Account menu | §1.4 | partial | `SidebarAccountMenu.tsx` mixes vessel scope and account actions | Top-bar avatar menu; vessel scope removed from it | P1 | S |
| IA17 | Breadcrumb and page title | — | complete | `PageLocationHeader.tsx`, `resolvePageNavigation` | Restyle: title in display font, actions slot on the right, record reference chip | P2 | S |
| IA18 | Footer | §1.4 | complete | `InkfishFooter.tsx` | Tagline from Account settings (DS5) | P2 | S |
| IA19 | Mobile and tablet shell | — (T-174, T-313) | partial | mobile drawer, Esc / focus handling in `DashboardLayout.tsx`; `ModuleTopNav` density modes | 52 px top bar, scrollable tab row, bottom safe-area padding, tablet-first record layout, 44 px targets | P1 | M |
| IA20 | Sidebar collapse to icons | §1.3 | complete | `DashboardLayout.tsx` (Ctrl+B, `storm-sidebar-collapsed`) | Keep; store in `user_preferences.sidebar_collapsed` as well | P2 | S |
| IA21 | Badge counts in the nav | §1.3 (Support badge) | partial | `useSidebarBadgeCounts.ts` (3 badges) | Badge registry per leaf: Support (waiting on account), Safety (waiting on vessel), Technical (overdue jobs), Documents (must-read, T-79) | P1 | S |
| IA22 | Dead shell code removed | — | partial | `VesselToggleBar.tsx`, `GlobalHeaderControls.tsx`, `HeaderQuickActions.tsx`, `AdaptiveActionBar.tsx`, `ADMIN_NAV_ITEMS`, `_unused_legacy`, `src/App.css` | Delete after the top bar ships | P2 | S |
| IA23 | Scope-preserving vessel switch | §1.5 | missing | switching vessel changes context only; URL unchanged | Sub-path mapping (§ Workflows W2) | P0 | S |
| IA24 | Data-driven nav sections (certificate sections, vessel document sections, logbooks, departments) | §5.3, §5.2.14 | placeholder | static leaves in `sitemap.ts` (11 certificate, 18 safety-document, 1 hard-coded logbook, 68 department placeholders) | Async nav providers per module that return children for the active vessel | P1 | M |
| IA25 | Impersonation banner in the top bar | §2.6, §7.10 | missing | — | Warning-tone bar state with "End" action (behaviour in doc 01) | P1 | S |
| IA26 | Installable web app (manifest, icons, `theme-color`) | — (T-313) | missing | `public/` has only `favicon.ico` | Web manifest with Abyss `background_color` / `theme_color`, maskable icons, `display: standalone` | P2 | S |

---

## A. The STORM "Abyss" design system (deliverable A)

**Character:** a ship's bridge at night. Deep, quiet surfaces; information lit from within; one luminous accent (Signal) that means "you can act here"; status colours reserved for status. Calm, premium, operational — not a generic SaaS blue. Dark is the default because crews work in dim bridges and engine control rooms, and because the owner's crews asked for exactly this look on tablets (T-174: dark navy background, white text, blue accents, large touch targets, iPad landscape).

### A.1 Colour families (raw scales)

All values are HSL triplets for the shadcn `hsl(var(--x))` convention. Raw scales are theme-independent; components should use the semantic tokens in A.2, and reach for raw steps only in the design-system components themselves.

| Family | Step | HSL | Hex | Role |
|---|---|---|---|---|
| **Abyss** (deepest backgrounds) | 950 | `216 50% 4%` | #05090f | Sidebar, overlay base, map water (dark) |
| | 900 | `215 45% 6%` | #080e16 | Page background, top bar |
| **Deep** (surfaces / cards) | 900 | `213 35% 9%` | #0f161f | Cards, tables, chart surface |
| | 850 | `213 32% 11%` | #131b25 | Sunken wells inside cards; sidebar hover |
| | 800 | `213 31% 12%` | #151e28 | Popovers, menus, dialogs |
| | 700 | `213 28% 16%` | #1d2834 | Hover / pressed surface (`accent`) |
| **Slate** (raised surfaces, borders, inputs) | 900 | `212 24% 15%` | #1d262f | Muted fills: table header, chips, input fill |
| | 850 | `212 24% 17%` | #212b36 | Secondary buttons |
| | 800 | `212 22% 20%` | #28323e | Borders and dividers |
| | 700 | `212 18% 27%` | #384451 | Strong dividers, scrollbar thumb, disabled fill |
| | 600 | `211 14% 34%` | #4b5663 | Disabled icons |
| | 500 | `211 16% 42%` | #5a6b7c | Input borders (≥ 3:1 against cards) |
| **Drift** (text and muted UI) | 500 | `210 14% 58%` | #8594a3 | Tertiary text, placeholders, axis labels, eyebrows |
| | 400 | `210 18% 68%` | #9fadbc | Secondary text (`muted-foreground`) |
| | 200 | `210 24% 82%` | #c6d1dc | Sidebar text, secondary values |
| | 50 | `210 40% 96%` | #f1f5f9 | Primary text (`foreground`) |
| **Signal** (brand accent, interactive; bioluminescent cyan) | 200 | `186 85% 82%` | #aaf0f8 | Pressed-on-dark highlight |
| | 300 | `186 88% 68%` | #66e7f5 | Hover on dark; `cyan` token |
| | 400 | `187 82% 55%` | #2ed4ea | **Primary on dark**, focus ring, active nav |
| | 500 | `189 80% 40%` | #149fb8 | Chart series 1 (dark), map tracks |
| | 600 | `190 85% 33%` | #0d849c | Focus ring on light |
| | 700 | `192 88% 26%` | #08657d | **Primary on light** |
| | 800 | `193 85% 20%` | #084c5e | Primary hover on light |
| | 900 | `192 60% 13%` | #0d2d35 | Selected row / active segment on dark (`signal-muted`) |
| **Ok** | 400 / 700 | `152 60% 50%` / `152 72% 26%` | #33cc85 / #137245 | success (dark / light) |
| **Warn** | 400 / 700 | `38 96% 60%` / `30 92% 31%` | #fbb337 / #984f06 | warning (dark / light) |
| **Danger** | 400 / 700 | `356 86% 67%` / `356 72% 44%` | #f3626c / #c11f2a | critical, destructive (dark / light) |
| **Info** | 400 / 700 | `216 92% 72%` / `217 76% 42%` | #76aaf9 / #1a58bc | info (dark / light) |

Why cyan for Signal: it reads as instrument light against navy (chart-plotter and night-mode bridge displays), it is clearly separate from the status hues (green 152°, amber 38°, red 356°, info blue 216°), and it moves STORM off the generic 217° SaaS blue it uses today.

### A.2 Semantic tokens — every existing variable in `src/index.css`

Dark is the default theme (`.dark` class present). Light ("Daylight") is optional. On dark, every solid fill (primary, status, decorative) carries **dark text** (`Abyss-900`); on light, solid fills carry white text. This is what lets one token serve both as a text colour on surfaces and as a button fill while passing AA.

**Core**

| Variable | Dark (default) | Hex | Light (optional) | Hex | Family / step |
|---|---|---|---|---|---|
| `--background` | `215 45% 6%` | #080e16 | `210 25% 97%` | #f5f7f9 | Abyss-900 |
| `--foreground` | `210 40% 96%` | #f1f5f9 | `215 45% 9%` | #0d1521 | Drift-50 |
| `--card` | `213 35% 9%` | #0f161f | `0 0% 100%` | #ffffff | Deep-900 |
| `--card-foreground` | `210 40% 96%` | #f1f5f9 | `215 45% 9%` | #0d1521 | Drift-50 |
| `--popover` | `213 31% 12%` | #151e28 | `0 0% 100%` | #ffffff | Deep-800 |
| `--popover-foreground` | `210 40% 96%` | #f1f5f9 | `215 45% 9%` | #0d1521 | Drift-50 |
| `--primary` | `187 82% 55%` | #2ed4ea | `192 88% 26%` | #08657d | Signal-400 / 700 |
| `--primary-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff | Abyss-900 / white |
| `--secondary` | `212 24% 17%` | #212b36 | `210 22% 92%` | #e6ebef | Slate-850 (was bright blue) |
| `--secondary-foreground` | `210 40% 96%` | #f1f5f9 | `215 45% 12%` | #111c2c | Drift-50 |
| `--muted` | `212 24% 15%` | #1d262f | `210 22% 94%` | #ecf0f3 | Slate-900 |
| `--muted-foreground` | `210 18% 68%` | #9fadbc | `213 16% 37%` | #4f5d6d | Drift-400 |
| `--accent` | `213 28% 16%` | #1d2834 | `205 40% 93%` | #e6eef4 | Deep-700 (hover surface; was bright blue) |
| `--accent-foreground` | `210 40% 96%` | #f1f5f9 | `215 45% 9%` | #0d1521 | Drift-50 |
| `--destructive` | `356 86% 67%` | #f3626c | `356 72% 44%` | #c11f2a | Danger-400 / 700 |
| `--destructive-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff | |
| `--border` | `212 22% 20%` | #28323e | `212 20% 86%` | #d4dbe2 | Slate-800 |
| `--input` | `211 16% 42%` | #5a6b7c | `212 12% 54%` | #7c8998 | Slate-500 (3:1) |
| `--ring` | `187 82% 55%` | #2ed4ea | `190 85% 34%` | #0d88a0 | Signal-400 / 600 |
| `--radius` | `0.625rem` | | `0.625rem` | | 10 px cards; see A.4 |

**Status and decorative families** (`-muted` = tinted surface for pills and banners; text on it uses the base colour)

| Variable | Dark | Hex | Light | Hex |
|---|---|---|---|---|
| `--success` | `152 60% 50%` | #33cc85 | `152 72% 26%` | #137245 |
| `--success-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--success-muted` | `154 45% 12%` | #112c20 | `150 45% 93%` | #e5f5ed |
| `--warning` | `38 96% 60%` | #fbb337 | `30 92% 31%` | #984f06 |
| `--warning-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--warning-muted` | `34 60% 12%` | #31210c | `40 90% 92%` | #fdf1d8 |
| `--info` | `216 92% 72%` | #76aaf9 | `217 76% 42%` | #1a58bc |
| `--info-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--info-muted` | `218 50% 15%` | #132139 | `216 85% 95%` | #e7f0fd |
| `--critical` | `356 86% 67%` | #f3626c | `356 72% 44%` | #c11f2a |
| `--critical-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--critical-muted` | `354 50% 14%` | #361215 | `356 80% 96%` | #fdedee |
| `--orange` | `24 95% 64%` | #fa924c | `22 90% 38%` | #b84a0a |
| `--orange-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--orange-muted` | `22 55% 13%` | #331c0f | `24 90% 94%` | #fdede2 |
| `--purple` | `266 85% 77%` | #be92f6 | `266 60% 46%` | #6c2fbc |
| `--purple-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--purple-muted` | `266 40% 16%` | #271839 | `266 70% 96%` | #f4eefc |
| `--cyan` | `186 88% 68%` | #66e7f5 | `190 90% 27%` | #076e83 |
| `--cyan-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--cyan-muted` | `190 60% 12%` | #0c2b31 | `188 70% 93%` | #e1f6fa |
| `--amber` | `45 93% 60%` | #f8c83a | `38 92% 30%` | #935f06 |
| `--amber-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--amber-muted` | `42 55% 12%` | #2f250e | `45 92% 91%` | #fdf3d3 |
| `--pink` | `330 80% 74%` | #f288bd | `330 65% 42%` | #b1256b |
| `--pink-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--pink-muted` | `330 40% 15%` | #361726 | `330 75% 96%` | #fcedf5 |
| `--indigo` | `234 88% 77%` | #919bf8 | `236 55% 50%` | #3943c6 |
| `--indigo-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--indigo-muted` | `234 40% 17%` | #1a1d3d | `234 80% 96%` | #edeefd |
| `--teal` | `168 62% 50%` | #30cfaf | `170 80% 24%` | #0c6e5e |
| `--teal-foreground` | `215 45% 6%` | #080e16 | `0 0% 100%` | #ffffff |
| `--teal-muted` | `170 50% 11%` | #0e2a25 | `168 55% 92%` | #dff6f1 |

`--critical` and `--destructive` are deliberately the same colour (one "danger" meaning). `--cyan` is Signal-300 on dark, so do not use it for anything that is not interactive or Signal-related.

**Sidebar** — the sidebar stays Abyss in both themes ("anchored chrome"; Open question 2), so the light column repeats the dark values.

| Variable | Dark | Hex | Light | Hex |
|---|---|---|---|---|
| `--sidebar-background` | `216 50% 4%` | #05090f | `216 50% 4%` | #05090f |
| `--sidebar-foreground` | `210 24% 82%` | #c6d1dc | `210 24% 82%` | #c6d1dc |
| `--sidebar-primary` | `187 82% 55%` | #2ed4ea | `187 82% 55%` | #2ed4ea |
| `--sidebar-primary-foreground` | `215 45% 6%` | #080e16 | `215 45% 6%` | #080e16 |
| `--sidebar-accent` | `213 32% 11%` | #131b25 | `213 32% 11%` | #131b25 |
| `--sidebar-accent-foreground` | `210 40% 96%` | #f1f5f9 | `210 40% 96%` | #f1f5f9 |
| `--sidebar-border` | `212 26% 13%` | #19212a | `212 26% 13%` | #19212a |
| `--sidebar-ring` | `187 82% 55%` | #2ed4ea | `187 82% 55%` | #2ed4ea |

**Charts** — categorical order fixed; colour follows the entity, never its rank; series 6 is the neutral "Other". Validated with the dataviz palette validator (lightness band, chroma floor, adjacent-pair colour-vision-deficiency separation, normal-vision floor, ≥ 3:1 against the chart surface): dark worst adjacent CVD ΔE 14.4, normal-vision ΔE 23.8 on `#0f161f`; light worst adjacent CVD ΔE 13.6, normal-vision ΔE 24.3 on `#ffffff`. All pass.

| Variable | Dark | Hex | Light | Hex | Hue |
|---|---|---|---|---|---|
| `--chart-1` | `189 80% 39.4%` | #149db5 | `189 80% 37.7%` | #1396ad | Signal cyan |
| `--chart-2` | `24 85% 46.7%` | #dc6312 | `24 85% 44.8%` | #d35f11 | Orange |
| `--chart-3` | `264 72% 66.7%` | #9e6de7 | `264 72% 64.8%` | #9865e6 | Violet |
| `--chart-4` | `44 90% 36.5%` | #b18409 | `44 90% 34.9%` | #a97e09 | Mustard |
| `--chart-5` | `328 68% 58.7%` | #dd4e9a | `328 68% 55.6%` | #db4193 | Magenta |
| `--chart-6` | `210 12% 52%` | #768593 | `212 10% 54%` | #7e8995 | Neutral "Other" (4.8:1 / 3.6:1) |

Rules: status data (expired / due / valid, breaches) uses status tokens, never chart tokens; ≥ 2 series always get a legend, ≤ 4 also direct labels; values and labels use text tokens, not series colours; a table view is available for every chart; beyond 5 series fold into "Other" or small multiples. Axis text Drift-500, gridlines `border` at 60 %, tooltip = popover surface.

**Gradients**

| Variable | Dark | Light |
|---|---|---|
| `--gradient-primary` | `linear-gradient(135deg, hsl(192 88% 26%), hsl(187 82% 55%))` | `linear-gradient(135deg, hsl(193 85% 20%), hsl(190 85% 33%))` |
| `--gradient-card` | `linear-gradient(180deg, hsl(213 35% 10%), hsl(213 35% 8%))` | `linear-gradient(180deg, hsl(0 0% 100%), hsl(210 25% 98%))` |

Gradients are for the sign-in hero and empty-state illustrations only; never on data surfaces or buttons.

**New semantic tokens to add**

| Variable | Dark | Light | Use |
|---|---|---|---|
| `--overlay` | `216 50% 2%` (used at 70 %) | `215 45% 9%` (at 40 %) | Dialog / sheet / drawer backdrop (replaces `bg-black/80`) |
| `--surface-sunken` | `213 32% 11%` | `210 22% 96%` | Wells, code blocks, read-only fields |
| `--signal-muted` | `192 60% 13%` | `190 60% 93%` | Selected row, active segment, active nav item fill |
| `--topbar` | `215 45% 6%` (at 88 % + blur) | `0 0% 100%` (at 88 % + blur) | Top bar and tab row |
| `--weekend` | `212 24% 15%` (at 50 %) | `210 22% 94%` | Planner / calendar weekend columns (T-27) |
| `--today` | `187 82% 55%` | `192 88% 26%` | Today line and marker |
| `--map-water` | `216 50% 4%` | `210 30% 92%` | Leaflet container background while tiles load (A.11) |

**Measured contrast (WCAG 2.x, computed on 8-bit values; 72 pairs per theme, 0 failures)**

| Pair | Dark | Light | Needed |
|---|---|---|---|
| foreground on background / card / popover / muted | 17.7 / 16.6 / 15.4 / 14.0 | 17.1 / 18.3 / 18.3 / 16.0 | 4.5 |
| muted-foreground on background / card / popover / muted | 8.5 / 8.0 / 7.4 / 6.7 | 6.3 / 6.7 / 6.7 / 5.9 | 4.5 |
| Drift-500 (tertiary) on card / muted | 5.9 / 4.9 | 5.0 (light equivalent `213 12% 45%`) | 4.5 for text, 3 for non-text |
| primary-foreground on primary | 10.8 | 6.6 | 4.5 |
| primary as text / link on card | 10.2 | 6.6 | 4.5 |
| destructive-foreground on destructive; destructive text on card | 6.3; 5.9 | 6.0; 6.0 | 4.5 |
| success / warning / info / critical text on own `-muted` | 7.2 / 8.6 / 6.8 / 5.4 | 5.3 / 5.4 / 5.8 / 5.3 | 4.5 |
| success / warning / info / critical text on card | 8.8 / 10.1 / 7.7 / 5.9 | 6.0 / 6.1 / 6.6 / 6.0 | 4.5 |
| orange / purple / cyan / amber / pink / indigo / teal on own `-muted` | 7.1 / 6.8 / 10.2 / 9.6 / 6.9 / 6.4 / 7.8 | 4.6 / 6.7 / 5.3 / 4.9 / 5.6 / 6.5 / 5.5 | 4.5 |
| `-foreground` on every solid status / decorative fill (lowest) | 6.3 (critical) | 5.2 (orange) | 4.5 |
| input border on card / background | 3.3 / 3.5 | 3.6 / 3.3 | 3 (WCAG 1.4.11) |
| focus ring on background / card | 10.8 / 10.2 | 3.9 / 4.2 | 3 |
| sidebar-foreground on sidebar; Signal on sidebar | 12.9; 11.1 | same | 4.5 |
| foreground on selected row (`signal-muted`) | 13.3 | 16.2 | 4.5 |

Known traps the migration must avoid: **white text on the dark primary is 1.8:1** (always use `text-primary-foreground`); a leftover `bg-white` card on Abyss is a 19:1 glare block (the compatibility layer in §C catches it). `--border` (1.4:1) is decorative only; any control that needs a visible boundary uses `--input`.

### A.3 Typography

| Role | Family (Google Fonts) | Weights | Notes |
|---|---|---|---|
| UI and body (`font-sans`) | **Inter** (variable, optical size axis) | 400, 500, 600 | Tall x-height for dense tables; supports `tnum` (tabular figures), `zero` (slashed zero), `cv11` (single-storey a, optional). |
| Display (`font-display`) | **Barlow Semi Condensed** | 500, 600 | Page titles, eyebrows, KPI labels, vessel names in the switcher and tab row. Instrument / marine-signage feel; gives STORM its own voice. Verify `tnum` in the shipped subset before using it for KPI numerals; if absent, KPI numerals use Inter 600 with `tnum`. |
| Mono (`font-mono`) | **JetBrains Mono** | 400, 500 | Record references (`PTW-2026-061`), IMO / MMSI, coordinates, logbook cells, code. |

Delivery: self-host the same families with `@fontsource-variable/inter`, `@fontsource/barlow-semi-condensed`, `@fontsource/jetbrains-mono` (Latin + Latin-ext subsets, `font-display: swap`), so the app makes no third-party request over VSAT and works offline. Budget ≤ 120 KB woff2 total. Fallback stack `system-ui, -apple-system, "Segoe UI", sans-serif`.

**Scale** (desktop default density; rem at 16 px root)

| Token | Size / line | Weight | Family | Use |
|---|---|---|---|---|
| `text-display-lg` | 28 / 32 | 600 | display | Dashboard titles |
| `text-display` | 22 / 28 | 600 | display | Page titles (`PageLocationHeader`) |
| `text-title` | 17 / 24 | 600 | sans | Card and dialog titles |
| `text-subtitle` | 15 / 22 | 600 | sans | Section titles inside cards |
| `text-body` | 14 / 20 | 400 | sans | Default UI text, form fields |
| `text-body-sm` | 13 / 18 | 400 | sans | Table cells (compact), meta lines |
| `text-caption` | 12 / 16 | 500 | sans | Captions, helper text, footer |
| `text-eyebrow` | 11 / 14, +0.08 em, uppercase | 600 | display | Sidebar section headings, KPI labels, card eyebrows |
| `text-kpi` | 32 / 36 | 600 | display or sans (see above), `tnum` | KPI values |
| `text-mono` | 12.5 / 18 | 500 | mono | References, coordinates |

Numbers: tables, KPI values, dates, durations, coordinates and currency use `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`, made default inside `<DataTable>`, `<KpiTile>`, `<MatrixGrid>`). Numeric columns right-aligned; units in Drift-400 after the value. Dates `21 Nov 2026`, times `09:19 UTC`, durations as weeks + days for planners (T-27).

**Icons:** `lucide-react`, stroke 1.75; 16 px in tables and buttons, 18 px in nav, 20 px in the top bar. Fixed module icons: Crew `Users`, Safety `ShieldHalf`, Certificates `Award`, Technical `Wrench`, Charter `Compass`, Vessel `Ship`, Logbooks `BookOpen`, Finance `Banknote`, Departments `Building`, Calendar `CalendarDays`, Reports `FileBarChart`.

### A.4 Radius, elevation and glow

| Token | Value | Use |
|---|---|---|
| `--radius` (lg) | 10 px | Cards, dialogs, popovers, map cards |
| `rounded-md` | 8 px | Buttons, inputs, selects, tabs |
| `rounded-sm` | 6 px | Chips, code chips, small badges |
| `rounded-full` | — | Status pills, avatars, count badges |

On dark, shadows barely show; depth comes from **surface steps + a 1 px top highlight + border**:

| Level | Surface | Border | Shadow | Use |
|---|---|---|---|---|
| e0 | background (Abyss-900) | — | none | Page |
| e1 | card (Deep-900) | `border` | `inset 0 1px 0 hsl(0 0% 100% / 0.04), 0 1px 2px hsl(216 60% 2% / 0.5)` | Cards, tables, KPI tiles |
| e2 | popover (Deep-800) | `border` | `0 8px 24px hsl(216 60% 2% / 0.6)` | Menus, popovers, switcher, tooltips |
| e3 | popover (Deep-800) | `border` | `0 24px 64px hsl(216 60% 2% / 0.7)` + overlay backdrop with 4 px blur | Dialogs, sheets, command palette |
| `glow-signal` | — | `primary / 50` | `0 0 0 1px hsl(var(--primary) / 0.5), 0 0 16px hsl(var(--primary) / 0.25)` | Active tab underline, active nav bar, selected map vessel, live AIS ping |

Light theme uses the same levels with conventional soft shadows (`0 1px 3px hsl(215 30% 20% / 0.08)` etc.); no glow on light.

### A.5 Focus

`focus-visible:` only (no ring on mouse click): `outline: 2px solid hsl(var(--ring)); outline-offset: 2px;` with the offset area painted in the surface colour (`ring-offset-background`, or `ring-offset-sidebar` in the sidebar, `ring-offset-card` inside cards). Never `outline-none` without a replacement. Skip link "Skip to content" is the first focusable element of the shell. Matrix cells use an inset ring so neighbours are not covered.

### A.6 Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-quick` | 120 ms | `cubic-bezier(0.2, 0, 0, 1)` ("tide") | Hover, press, toggles |
| `motion-menu` | 180 ms | tide | Popovers, dropdowns, tooltips |
| `motion-panel` | 240 ms | tide in, `cubic-bezier(0.4, 0, 1, 1)` out | Sheets, drawers, sidebar collapse, page fade |
| `motion-indicator` | 320 ms | tide | Tab and nav sliding indicator |
| `motion-ping` | 2.4 s loop | ease-out | Live AIS position only |

`@media (prefers-reduced-motion: reduce)`: all transitions ≤ 1 ms, loops disabled, skeleton shimmer replaced by a static fill. No parallax, no bouncing, no confetti.

### A.7 Density

| Density | Row height | Control height | Card padding | Default for |
|---|---|---|---|---|
| Comfortable | 44 px | 44 px | 20 px | Touch devices < 1024 px; record pages used on deck (permit, drill completion, checklists, rounds) |
| Default | 40 px | 36 px | 16 px | Desktop |
| Compact | 32 px | 32 px | 12 px | Registers, matrices, comparison tables; user preference |

Set with `data-density` on `<html>` (user preference in Appearance) and overridable per component (`<DataTable density="compact">`). This replaces the class-override block in `src/index.css` (`.storm-compact .p-6 { … }`) once the shared primitives read the density tokens.

### A.8 Status pills, whose-move chips and expiry tiers

`<StatusPill tone label icon? />`: full radius, 20 px high (24 px comfortable), 12 px / 600 text, 6 px leading dot or a 12 px icon, background `{tone}-muted`, text `{tone}`, 1 px border `{tone} / 25 %`. Never colour alone: the label is always present, and danger / warn tones carry an icon (`AlertOctagon`, `AlertTriangle`).

| Tone | Meaning | Examples |
|---|---|---|
| `ok` (success) | Done, valid, compliant | Completed, Signed, Closed by company, Valid |
| `signal` (primary on `signal-muted`) | Live / in progress | Active permit, Underway, In review |
| `info` | Waiting on the vessel | Open, Submitted, Waiting on crew |
| `purple` | Waiting on the company | Awaiting company sign-off, Further information required |
| `warn` | Attention soon | Due ≤ 90 days, Near threshold, Draft past due |
| `orange` | Attention now | Due ≤ 30 days, Endorsement due |
| `danger` | Failed / overdue | Expired, Overdue, Breach, Rejected |
| `neutral` (muted) | Inactive | Draft, Cancelled, Archived, Not applicable |

- **Status registry:** `src/shared/design/statusTone.ts` exports `statusTone(domain, status): Tone` with one map per domain (incident, corrective action, permit, risk assessment, drill, certificate, crew document, voyage, job, appraisal, support ticket, GDPR request). Every module's local colour helper is deleted in favour of it.
- **Whose-move chip** (engine 3, docs 05/08): "Waiting on vessel" (info), "Waiting on company" (purple), "Closed" (neutral), plus age ("12 days"). Shown on every SMS / permit / RA row and record header. This is the visual fix for T-78 (forms reading "Completed" while still awaiting company sign-off).
- **Expiry tier pill** (engine 1): Expired → danger; ≤ 30 days → orange; ≤ 90 days → warn; endorsement overdue → danger outline; endorsement due → warn outline; valid → ok. Text form: "52d overdue", "in 18d", "valid to 03 Mar 2027".
- **Role badges** (T-147, T-146): IHM, SSO, Safety Officer, Medical, Garbage Officer, Crew Rep, HOD — `rounded-sm`, outline style (`border-input text-drift-200`), mono 11 px, so they never read as status.

### A.9 KPI tile

`<KpiTile label icon value sub delta? tone? href state>`: e1 card, 16 px padding, min-height 132 px. Eyebrow label (display font, Drift-500) with an 18 px icon top-right; value `text-kpi` in foreground; one-line breakdown in Drift-400 (e.g. "7 certificates · 3 crew documents · 50 crew certificates expired"); optional delta chip (arrow icon + "−2 vs last month", ok / danger tone by direction of goodness). When the tile has alerts it gains a 3 px left bar and value colour in its tone (danger for overdue / expired). The whole tile is a link to the filtered list (focus ring on the tile).

States: **loading** (skeleton bars at the value and sub-line positions, never the bare grey blocks seen in the reference), **zero** ("0" plus "All clear" in ok tone), **not enabled** ("—" plus "Hours of Rest is off on 3 vessels", link for admins), **no access** (tile hidden). Grid: 6 across at ≥ 1440 px, 3 at ≥ 1024 px, 2 below.

### A.10 Data table

`<DataTable>` (on `components/ui/table.tsx` + `@tanstack/react-virtual`):

- Header row: `bg-muted`, sticky, 12 px / 600 sentence case (not uppercase), Drift-400; sort icon on hover, active sort in foreground with arrow. First column sticky in wide tables.
- Rows: no zebra; hover `bg-accent`; selected `bg-signal-muted` with a 2 px Signal left bar; 1 px `border` between rows. Row heights from density.
- Cells: numbers right-aligned `tabular-nums`; references `font-mono`; dates `whitespace-nowrap`; empty cell "–" in Drift-500 with a tooltip saying why (not covered / not applicable / no access) — the reference uses a bare dash.
- Values that signal trouble (e.g. "5 expired") use danger tone **and** 600 weight **and** an icon or arrow, so they read without colour.
- Toolbar above: search (left), **count chips** as filters ("All 94 · Custom 17 · Heads of department 27 · Can view medical 7"; "Ready for you 0 · Waiting on crew 5"), Filters button, Sort, density toggle, Export (CSV / Excel / PDF per §7.4). Chips show live counts and act as the "show non-compliant only" filter from T-142.
- Footer: "Showing 9 of 9 vessels, most findings first" style summary; pagination only when not virtualised.
- Row actions: icon buttons revealed on hover / focus, always visible on touch; destructive actions in a menu, never a bare red bin per row.

### A.11 Map styling

- **Basemap:** dark theme → CARTO Dark Matter (no labels) + a labels layer in Drift-400; light theme → CARTO Voyager. Container background set to the water colour (`Abyss-950` / `210 30% 92%`) so tiles loading over a slow link show sea, not white.
- **Layer switcher** (fleet tracker, vessel tracking; §4.2 lists the layer types the reference offers): Abyss (default), Daylight, Satellite (optional), overlays OpenSeaMap seamarks and GEBCO bathymetry.
- **Vessel marker:** 18 px heading arrow in Signal-400 with a 2 px Abyss ring; moored = circle; position older than 6 h = hollow Drift marker plus "Last fix 3d ago"; selected = `glow-signal`; alert state as a small badge (danger / warn dot) at the marker's shoulder, not as the marker colour.
- **Tracks:** past track Signal-500 2 px at 70 %; planned route Drift-200 dashed 2 px; port calls 8 px diamonds; clusters Deep-800 discs with Signal count text.
- **Popups:** popover surface, `border`, 10 px radius, e2 shadow, 13 px text — replaces the white `.leaflet-popup-content-wrapper` override in `src/index.css`. Attribution in Drift-500 11 px on `background / 70`.
- **Region cards** on the fleet dashboard (§4.1): 220 px map, header "Mediterranean · 2", "Open tracker" button in the map's lower-right corner as a ghost button on `popover / 85`.

### A.12 Empty, loading and error states

`<EmptyState kind title body action? secondary?>`: centred in its container, 40 px icon in a Slate-900 circle, `text-subtitle` title, one line of Drift-400 body, primary action only when the user can perform it.

| Kind | Title pattern | Action |
|---|---|---|
| first-use | "No permits yet" | "Open new permit" (if allowed) |
| filtered | "Nothing matches these filters" | "Clear filters" |
| not-enabled | "Charter is switched off for Draak" | "Open Vessel Settings" (admins); others see who can enable it |
| no-access | "You don't have access to medical records" | "Request access" (support ticket pre-filled) |
| error | "This page could not load" | "Try again", error reference for support |

Loading: skeletons that match the final layout (rows, tiles, cards), shimmer off under reduced motion; slow pages (> 3 s, cf. the 25–40 s fleet medical load noted in §1.5) show progressive content and a "Still loading — large fleet" note rather than a spinner.

---

## C. Restyle priorities and colour migration (deliverable C)

### C.1 Hard-coded colour audit (counts from `src/**/*.ts(x)`, generated Supabase types excluded)

| Pattern | Occurrences | Files |
|---|---|---|
| **All Tailwind palette classes** (`bg/text/border/ring/from/to/via/fill/stroke-{white,black,gray,slate,…,rose}[-shade]`) excluding STORM's own token names | **2,722** | **277** |
| `bg-white` / `text-white` / `bg-black` / `text-black` | 51 / 107 / 15 / 2 | 20 / 56 / 10 / 2 |
| `text-gray-*` / `bg-gray-*` / `border-gray-*` | 57 / 61 / 22 | 32 / 38 / 11 |
| `text-slate-*` / `bg-slate-*` / `border-slate-*` | 18 / 17 / 1 | 7 / 7 / 1 |
| `bg-blue-*` / `text-blue-*` / `border-blue-*` | 96 / 125 / 22 | 61 / 70 / 19 |
| red / green / emerald (bg, text, border) | 296 / 558 / 125 | 80 / 159 / 33 |
| amber / yellow / orange (bg, text, border) | 198 / 393 / 158 | 55 / 113 / 60 |
| purple, violet, indigo, pink, rose, teal, cyan, sky, lime, fuchsia | 229 | 58 |
| gradient stops `from-* / to-* / via-*` | 50 | 12 |
| Arbitrary hex classes `[#…]` | 9 | 1 (`VesselToggleBar.tsx`, dead) |
| Hex literals in TS/TSX | 243 | 33 (many legitimate: PDF and email generators) |
| `dark:` variants (partial earlier attempts) | 262 | 50 |
| Local status-colour helper functions | 25 | 16 |

**By module (palette-class occurrences):** hris 382 · refit 356 · new-build 328 · crew 281 · ism 222 · documents 151 · drills 139 · dashboard 137 · maintenance 124 · settings 97 · compliance 85 · incidents 80 · risk-assessments 64 · certificates 61 · red-room 52 · training 42 · feedback 41 · development 38 · vessels 29 · itinerary 28 · audits 23 · logbooks 15 · shared/components 13 · legal 12 · rotation-planner 9 · components/ui 7.

**Worst files (lines with palette classes):** `refit/components/ui-kit.tsx` 57 · `new-build/pages/interior/InteriorMaterials.tsx` 46 · `drills/components/EquipmentReadinessTab.tsx` 44 · `refit/pages/access.tsx` 27 · `ism/pages/ERMPage.tsx` 27 · `settings/pages/APIIntegrations.tsx` 26 · `dashboard/types.ts` 26 · `maintenance/pages/CriticalEquipment.tsx` 25 · `training/components/TrainingMatrixTab.tsx` 20 · `ism/pages/NonConformitiesPage.tsx` 20 · `ism/pages/CorrectiveActionsPage.tsx` 20 · `documents/pages/Procedures.tsx` 20. Shell-adjacent: `dashboard/components/fleet/FleetKPITiles.tsx` 36 occurrences, `dashboard/pages/Dashboard.tsx` 29, `dashboard/components/KPITiles.tsx` 21, `feedback/pages/FeedbackAdmin.tsx` 19, `dashboard/components/AlertKPITiles.tsx` 16, `feedback/components/FeedbackPanel.tsx` 16.

**Hex literals worth keeping** (allow-list in the ratchet): PDF generators (`logbooks/lib/logbookPdf.ts`, `hris/lib/payroll/payslip.ts`, `hris/lib/reviewPdf.ts`, `lib/pdf/pdfTemplate.ts`, `rotation-planner/lib/pdfExporter.ts`) and email templates (`lib/integrations/email/types.ts`) — these move to constants derived from the light palette. **Hex literals to convert:** category colours in `rotation-planner/constants.ts`, `crew/leaveConstants.ts`, `new-build/components/schedule/GanttChart.tsx` (→ chart tokens), map markers in `dashboard/pages/FleetMap.tsx` (→ map theme helper), `refit/pages/login-help.tsx`, `training/components/ComplianceOverviewTab.tsx`.

### C.2 Prioritised restyle list

| Order | Item | Files | Priority | Effort |
|---|---|---|---|---|
| 1 | Tokens, fonts, radius, shadows, motion; Tailwind keys for new tokens and families | `src/index.css`, `tailwind.config.ts`, `package.json` (font packages) | P0 | S |
| 2 | Theme runtime + flash-free first paint | `src/App.tsx` (ThemeProvider), `index.html` (pre-paint script, placeholder + watchdog colours, `theme-color`, `color-scheme`), `src/main.tsx` (recovery panel), `AppearanceSection.tsx` (use `setTheme`) | P0 | S |
| 3 | Compatibility layer (temporary): `src/styles/legacy-palette.css` under `.dark` remapping the 30 most frequent palette classes to tokens (e.g. `.dark .bg-white{background-color:hsl(var(--card))}`, `.dark .text-gray-900{color:hsl(var(--foreground))}`, `.dark .bg-green-100{background-color:hsl(var(--success-muted))}`, `.dark .text-green-800{color:hsl(var(--success))}`) so switching to dark produces no white blocks while the codemod runs. Deleted when the ratchet reaches zero. | new file | P0 | S |
| 4 | shadcn primitives: button (variants incl. `signal`, `ghost`, `destructive` with dark text), badge (tones), card (e1), table (density, header), input / select / textarea (3:1 border, Slate-900 fill), tabs (underline + Signal indicator), dialog / sheet / drawer / alert-dialog (overlay token, e3), dropdown / popover / tooltip / command (e2), toast + sonner (status tones, theme), skeleton, chart | `src/components/ui/*` | P0 | M |
| 5 | AppShell: `TopBar` (new), `ScopeControl` + `VesselSwitcher` (new, from `VesselSelector.tsx` search logic), `ModuleTabBar` (from `ModuleTopNav.tsx`), `SidebarNavigation` (section headings, Abyss styling — it already has the glowing active bar), `NotificationBell` (moved), account menu (from `SidebarAccountMenu.tsx`), `PageLocationHeader` (display font, actions slot) | `src/shared/components/layout/*` | P0 | L |
| 6 | New shared components: `StatusPill` + `statusTone`, `KpiTile`, `DataTable`, `EmptyState`, `CommandPalette` | `src/shared/components/data/*`, `src/shared/design/*` | P0 | M |
| 7 | Nav config: `status`, `kind: 'section'`, `scope`, `moduleSetting`, `labelKey`, `badgeKey` on nodes; Refit path fix; placeholder hiding; data-driven providers | `src/config/sitemap.ts`, `navigation-types.ts`, `src/test/config/sitemap*.test.ts` | P0 | M |
| 8 | Fleet dashboard (demo-critical): KPI tiles, region maps, expiry panels, vessel health matrix | `dashboard/components/fleet/*`, `KPITiles.tsx`, `AlertKPITiles.tsx`, `Dashboard.tsx`, `dashboard/types.ts` | P0 | M |
| 9 | Maps and Leaflet CSS | `FleetMap.tsx`, `RegionMapCard.tsx`, `HeatMapTab.tsx`, `index.css` Leaflet block | P1 | S |
| 10 | Sign-in, reset password, 404, placeholder, loader | `auth/pages/Auth.tsx`, `ResetPassword.tsx`, `shared/pages/NotFound.tsx`, `PlaceholderPage.tsx`, `LazyLoader.tsx` | P1 | S |
| 11 | Crew, Safety (ism, incidents, drills, risk-assessments), Certificates, Maintenance, Documents — in that order (demo path) | module folders, worst files first | P1 | L |
| 12 | Feedback panel and admin, settings pages | `feedback/*`, `settings/*` | P1 | S |
| 13 | Refit: retheme its local `ui-kit.tsx` once (57 lines) — most Refit pages inherit from it | `refit/components/ui-kit.tsx` then pages | P2 | M |
| 14 | HRIS (382, mostly badge colour maps → `statusTone`), New Build (328; `InteriorMaterials.tsx` material swatches are data and stay as data colours), red-room, training, development, others | module folders | P2 | L |
| 15 | Print / PDF light rule; watermark on dark; delete dead shell files and `App.css` | `PrintBook.tsx`, `pdfTemplate.ts`, `InkfishWatermark.tsx`, dead files | P2 | S |

### C.3 Migration approach

1. **Ship tokens and the compatibility layer together** (items 1–3) behind the user's Appearance choice: dark becomes the default for new sessions only after items 4–5 and the dashboard (8) are done; until then "Abyss (preview)" is selectable in Appearance. This avoids a big-bang switch that exposes every hard-coded white card at once.
2. **Codemod with a mapping table, then human review per module PR.** A Node script (`scripts/design/migrate-palette.mjs`) rewrites class strings in `className`, `cn()`, `cva()` and colour-map objects:

| From | To |
|---|---|
| `bg-white` | `bg-card` (or `bg-popover` inside menus) |
| `text-black`, `text-gray-900/800`, `text-slate-900/800` | `text-foreground` |
| `text-gray-700…400`, `text-slate-600…400` | `text-muted-foreground` |
| `bg-gray-50/100`, `bg-slate-50/100` | `bg-muted` |
| `bg-gray-200`, `bg-slate-200` | `bg-secondary` |
| `border-gray-*`, `border-slate-*` | `border-border` (dividers) or `border-input` (controls) |
| `bg-blue-500/600/700` + `text-white` | `bg-primary text-primary-foreground` |
| `text-blue-600/700` on links | `text-primary` |
| `bg-blue-50/100` + `text-blue-700/800` (status) | `<StatusPill tone="info">` or `bg-info-muted text-info` |
| `bg-{green,emerald}-50/100` + `text-{green,emerald}-600…800` | `<StatusPill tone="ok">` or `bg-success-muted text-success` |
| `bg-{red,rose}-50/100` + `text-{red,rose}-600…800` | `tone="danger"` / `bg-critical-muted text-critical` |
| `bg-{yellow,amber}-50/100` + `text-{yellow,amber}-600…800` | `tone="warn"` / `bg-warning-muted text-warning` |
| `bg-orange-50/100` + `text-orange-600…800` | `tone="orange"` / `bg-orange-muted text-orange` |
| solid `bg-{green,red,amber,orange}-500/600` + `text-white` | `bg-{success,critical,warning,orange} text-{…}-foreground` |
| `purple/violet`, `indigo`, `pink/rose (decorative)`, `teal`, `cyan`, `sky` | `purple`, `indigo`, `pink`, `teal`, `cyan`, `info` token families |
| `from-*/to-*/via-*` | `bg-gradient-primary` / `bg-gradient-card` or flat surface |
| `bg-black/80` overlays | `bg-overlay/70` |
| `dark:*` variants that duplicate the mapping | removed (tokens already switch) |

   Pairs that form a status badge are replaced with `<StatusPill>` rather than a class swap, and the module's local colour helper is deleted in the same PR.
3. **Ratchet test.** `src/test/design/paletteRatchet.test.ts` counts banned patterns per file and compares with `src/test/design/palette-baseline.json`. A file may never exceed its baseline; new files must be at zero; the baseline is regenerated downward in each migration PR. Allow-list: PDF / email generators and data-colour files listed in C.1. Optionally mirror it as an ESLint `no-restricted-syntax` rule on JSX `className` literals for editor feedback.
4. **Visual check per PR:** dark and light screenshots of the touched pages (sign-in, dashboard, one list, one record, one dialog) plus an automated contrast spot-check with axe in the existing a11y test setup (`*.a11y.test.tsx`).
5. **Remove the compatibility layer** when the ratchet total for the remapped classes reaches zero.

---

## Workflows & state machines

### W1. Theme resolution

States: `dark` · `light` · `system(dark|light)`. Initial for a new user: `dark`.

| Trigger | Transition | Who |
|---|---|---|
| First visit (no stored choice) | → `dark` | — |
| User picks a theme in Appearance or the account menu | → chosen state; written to `localStorage['storm-theme']` immediately and to `user_preferences.theme` (debounced) | the user |
| Sign-in on a new device | `user_preferences.theme` overrides `localStorage` | — |
| OS scheme changes while `system` | flips dark ↔ light live | — |
| Print | light token set forced via `@media print` regardless of state | — |

The pre-paint script in `index.html` reads `localStorage` before CSS loads and sets the `dark` class and `color-scheme`, so there is no white flash. Density follows the same pattern (`data-density`, `user_preferences.density`).

### W2. Scope navigation

States: `Fleet(page)` · `Vessel(vc, module, subpath)` · `Workspace(w, page)` · `Personal(page)`.

| From | Action | To | Guards / fallbacks |
|---|---|---|---|
| any | Fleet segment | `Fleet(counterpart(current) ?? dashboard)` | fleet access, else the segment is hidden |
| any | Vessel segment (name) | `Vessel(lastVessel, module ?? home)` | vessel reach |
| `Vessel(a, m, p)` | pick vessel b in switcher | `Vessel(b, m, p)` | if module m off for b → `Vessel(b, m-root)`; if m-root not allowed → `Vessel(b, home)` |
| `Fleet(page)` | pick vessel b | `Vessel(b, vesselCounterpart(page) ?? home)` | e.g. Fleet Training → Crew › Training |
| any | Apps → workspace w | `Workspace(w, first allowed leaf)` | workspace access |
| any | deep link | the link's scope | 403 page with "Ask an admin" if reach fails; "switched off" page if module off (doc 03) |
| any | sign-in | landing per doc 01 | — |

`lastVessel` is written to `user_preferences.last_vessel_id` on every vessel-scope visit. The vessel count shown anywhere in the shell uses one "counted vessels" query (§7.13).

### W3. Nav leaf lifecycle

States: `planned` → `beta` → `live` → `retired`.

| State | Visible to | Route behaviour |
|---|---|---|
| `planned` | nobody, unless the viewer is owner/admin with "Show roadmap" on (then shown with a "Planned" chip, Drift-500) | placeholder page with what is coming and a "Tell us what you need" link to Support |
| `beta` | everyone allowed, with a "Beta" chip (`signal` tone) | real page |
| `live` | everyone allowed | real page |
| `retired` | nobody | redirect to the replacement for one release, then removed |

Who changes it: developers, in `sitemap.ts`; a test fails if a `live` leaf resolves to the placeholder route or a `planned` leaf has a real route registered.

### W4. Module visibility in the vessel nav

Inputs: `vessel_module_settings(vessel, module, enabled, enabled_from, label_override)` (doc 01), the add-on entitlement (doc 03), user capabilities. Evaluation order as in "Nav visibility rule" above. Changes made in Vessel Settings autosave (§7.12) and invalidate the nav query so open sessions update without reload. Turning a module off hides the tab and its leaves for everyone on that vessel, including admins (admins still reach Vessel Settings through the cog); data is kept.

### W5. Colour migration per file

`untouched` → `auto-migrated` (codemod) → `reviewed` (visual check in dark and light) → `locked` (baseline at zero). Only the reviewer can move a file to `locked` by regenerating the baseline in the PR.

---

## Data model

| Entity | Key fields | Existing STORM table(s) | Notes |
|---|---|---|---|
| User appearance preferences | `theme` (`dark`/`light`/`system`), `density` (`comfortable`/`default`/`compact`), `sidebar_collapsed`, `last_vessel_id`, `show_roadmap`, `reduced_motion` (`system`/`on`) | `user_preferences` (has `theme`, `sidebar_collapsed`, `default_vessel_id`, `dashboard_widgets`) | Add `density text check (…) default 'default'`, `last_vessel_id uuid references vessels`, `show_roadmap boolean default false`, `reduced_motion text default 'system'`. Change the `theme` default to `'dark'`. RLS: own row only (existing). |
| Favourites | `user_id`, `shortcut_label`, `shortcut_target` (route), `shortcut_icon`, `sort_order` | `user_pinned_shortcuts` | Reused as is by the top-bar star. Targets must be scope-qualified routes (`/v/dra/…`), so a favourite opens the right vessel. |
| Sidebar order | per-group child order | `localStorage` (`useSidebarOrder.ts`) | Optional: move to `user_preferences.sidebar_order jsonb` so it follows the user across devices. |
| Tenant branding | `client_display_name`, `client_logo_url`, `brand_color` + NEW `client_logo_dark_url`, `footer_tagline` | `companies` | Upload validation as doc 01 F1 (JPEG / PNG / WebP / SVG, ≤ 5 MB). Edited on the Account page (doc 03). |
| Vessel module settings | `vessel_id`, `module_key`, `enabled`, `enabled_from`, `label_override` | NEW: `vessel_module_settings` (doc 01 F11) | Read by the nav resolver; this doc adds no columns. |
| Nav node (code, not DB) | `id`, `label`, `path`, `icon`, `kind` (`leaf`/`group`/`section`), `status` (`planned`/`beta`/`live`/`retired`), `scope` (`fleet`/`vessel`/`workspace`/`personal`), `moduleKey`, `minPermission`, `moduleSetting`, `labelKey`, `badgeKey`, `crossLink`, `selfServe`, `children` or `provider` (async children for data-driven sections) | `src/config/navigation-types.ts` `NavChild` | Extend the type; keep existing fields so current gating keeps working. |
| Nav badge counts | `badgeKey → count, tone` | `useSidebarBadgeCounts.ts` (3 keys) | Extend with a registry; each module registers a lightweight count RPC. |
| Status tone registry (code) | `domain`, `status` → `tone`, `label`, `icon` | NEW: `src/shared/design/statusTone.ts` | Single source for pill colours; replaces the 25 local helpers. |

---

## Improvements over the reference

| # | Improvement | Ticket theme / evidence |
|---|---|---|
| 1 | **Dark-first, tablet-ready look.** The owner's own crews asked for a dark navy, high-contrast, large-target checklist for iPad landscape; Abyss makes that the default everywhere, with comfortable density on touch devices. | T-174 |
| 2 | **Switched-off and unbuilt things vanish.** Modules turned off per vessel and planned pages are removed from the nav entirely, not greyed or "coming soon". Several tickets were spent asking to hide unused Technical items, maintenance templates and the Leave area. | T-10, T-12, T-14, T-21 |
| 3 | **Every record and page has a scope-qualified URL; switching vessel keeps your place.** Email and notification links open the exact record in the right vessel. | T-252 |
| 4 | **Status vocabulary separates "vessel done" from "company done".** The whose-move chip and a dedicated purple "Awaiting company sign-off" tone stop forms reading Completed while still open ashore. | T-78 |
| 5 | **Count chips as filters on every register** (e.g. non-compliant only, waiting on crew), with live counts, and deficit columns in numeric style. | T-142, screenshot of the hours-of-rest board |
| 6 | **Search everywhere.** ⌘K palette over pages, vessels, people and record references; every person picker is a type-ahead combobox sorted by rank then name. | T-166, T-288 |
| 7 | **Help in the top bar with FAQ search**, not only an assistant. | T-288 |
| 8 | **Role badges distinct from status pills** (outline, mono) so IHM / SSO / Medical badges never look like alerts. | T-146, T-147 |
| 9 | **No empty KPI tiles.** The reference shows blank grey bars for Hours of Rest, Leave, Technical and Finance; STORM shows zero / not enabled / loading explicitly with a reason. | Screenshot of the fleet dashboard |
| 10 | **Overdue numbers readable without colour** (weight + icon), and dashes in tables explain themselves on hover. | Screenshot of the vessel comparison report |
| 11 | **One vessel count everywhere** in the shell (switcher, dashboard header, filters). | §7.13 |
| 12 | **Labelled, keyboard-reachable top-bar icons** with tooltips and shortcuts (`g f`, `g v`, ⌘K, `?`), replacing a row of unlabeled icons. | Screenshots of the top bar |
| 13 | **Planner readability tokens**: weekend tint, today line, durations in weeks + days, remembered zoom. | T-27 |
| 14 | **Installable app with offline-safe fonts and sea-coloured map loading**, for crew who mainly use a phone or a slow link. | T-313; `App.tsx` note on slow links at sea |
| 15 | **Must-read and pending counts as nav badges.** | T-79 |
| 16 | **Matrix pages built for review**: sticky row and column headers, column groups, staged edits with a review footer (§7.12) instead of a 17-column wall of tiny checkboxes. | Screenshot of the users-and-access matrix; T-146 |

---

## Implementation notes

**Reuse**
- `ModuleTopNav.tsx`: keep the density measurement (`DENSITY_MIN_WIDTH`, `ResizeObserver`) and the sliding indicator; feed it vessel modules instead of `NAVIGATION_ITEMS`, and render it as `ModuleTabBar` under the top bar.
- `SidebarNavigation.tsx`: keep `canShow` (HR / payroll / medical / wellness resolvers), `applySidebarOrder`, active-leaf resolution and the live-region announcements; add the `section` node kind, the `status` filter and the vessel-module filter. The collapsed-mode glowing active bar already matches `glow-signal`.
- `DashboardLayout.tsx`: keep the mobile drawer focus management, Esc handling and Ctrl+B; split into `AppShell` (top bar + optional tab row + sidebar + main) with a `scope` prop. `RefitShell`, `NewBuildShell` and the HRIS / Health route wrappers keep wrapping it.
- `VesselSelector.tsx`: reuse the search and keyboard handling; delete the mock `SEVERITY_FILTERS` and `FLEET_GROUPS` arrays; read fleet groups from `fleet_groups` (doc 01 F7).
- `components/ui/command.tsx` (`cmdk` already installed) for the switcher and the palette; `usePinnedShortcuts.ts` for favourites; `useSidebarBadgeCounts.ts` for badges; `resolvePageNavigation` for titles and breadcrumbs; `BrandingContext.tsx` for logo and name.
- `components/ui/chart.tsx` already reads `hsl(var(--chart-n))`; only the token values change.

**Migrations**
- `user_preferences`: add `density`, `last_vessel_id`, `show_roadmap`, `reduced_motion`; set `theme` default `'dark'` (existing `null` rows resolve to dark in code). Regenerate `src/integrations/supabase/types.ts` (AppearanceSection currently casts `supabase as any` to reach this table).
- `companies`: add `client_logo_dark_url text`, `footer_tagline text`.
- No other schema work in this domain; `vessel_module_settings` belongs to doc 01.

**CSS structure**
- Keep Tailwind's class strategy: `:root` holds raw scales plus the light semantic values; `.dark` overrides the semantic values. `next-themes` with `defaultTheme="dark"` adds `.dark` by default, so the 262 existing `dark:` variants keep working until the codemod removes them.
- Expose raw scales as `abyss`, `deep`, `slate-ui` (Tailwind already has `slate`), `drift`, `signal`; status families as today. Add `fontFamily` (`sans`, `display`, `mono`), `transitionTimingFunction.tide`, `boxShadow.e1/e2/e3/glow-signal`, and the new semantic colours (`overlay`, `surface-sunken`, `signal-muted`, `topbar`).
- Delete `src/App.css` (Vite scaffold, never imported). Replace the `.storm-compact` override block once primitives read density tokens.
- Leaflet: set `.leaflet-container { background: hsl(var(--map-water)); font-family: inherit; }` and restyle popups, controls and attribution with tokens.

**Nav config**
- Fix `yardRefit` in `sitemap.ts` by passing ``existing: `${refitOverview}/dashboard` `` (or calling `L(label, refitOverview, { slug: 'dashboard' })`) for all 32 leaves; extend `src/test/config/sitemapTargets.test.ts` to fail on repeated consecutive segments and on leaves that resolve to a placeholder while a real route with the same prefix exists.
- Keep `PLACEHOLDER_LEAVES` routes (no 404s), but filter `status: 'planned'` leaves out of `SidebarNavigation` unless `show_roadmap`.
- Vessel-module sub-trees become functions `buildVesselNav(vesselCode, settings, caps)`; data-driven groups (certificate sections, vessel document sections, logbooks, departments) use an async `provider` resolved through React Query and cached per vessel.

**Pitfalls**
- `accent` changes meaning from "bright blue" to "hover surface". 98 class usages: `bg-accent/10…/60` (84) are hover tints and stay correct; `text-accent` (12) and `border-accent` (2) must become `text-primary` / `border-primary`.
- `secondary` changes from bright blue to neutral. 46 class usages and 183 `variant="secondary"` buttons / badges lose their blue emphasis; review screens that used it as a second brand colour.
- `text-white` on token fills: 3 lines pair `bg-primary`/status fills with `text-white`; on dark these fail (white on Signal-400 is 1.8:1). Always `text-{token}-foreground`.
- `toast.tsx` destructive variant and `dialog.tsx`/`sheet.tsx`/`drawer.tsx`/`alert-dialog.tsx` overlays use palette classes; fix them in step 4 or every dialog in the app looks wrong.
- The Inkfish watermark rule ("must appear on all pages") stays; on dark it must not lift the background luminance above ~3 % or it reduces text contrast.
- Two vessel-scope states exist today (`VesselContext` selection and `DashboardFilterContext` multi-select). The new switcher writes only the URL; the dashboard's "Vessels shown" filter becomes a page filter (doc 02), not a global scope.
- Keep 44 px minimum targets on touch even in compact density (WCAG 2.5.8 and the accessibility work already done in `*.a11y.test.tsx`).

---

## Open questions

1. **Tenant brand colour vs Signal.** Should an account be allowed to replace Signal with its own brand colour? Recommendation: no — use the brand colour only for the logo plate edge and PDF accents, because an arbitrary colour cannot be guaranteed to pass contrast as both a fill and a text colour on Abyss.
2. **Light theme sidebar.** Keep the Abyss sidebar in the light theme ("anchored chrome", proposed) or make the light theme fully light?
3. **Display typeface.** Adopt Barlow Semi Condensed for titles, eyebrows and KPI labels (proposed), or keep a single family (Inter) throughout?
4. **Default theme for existing users.** Switch everyone to dark on release, or only new sessions, with existing users seeing a one-time "Try Abyss" prompt?
5. **Shoreside services.** The eight Shoreside entries are placeholders. Are they products to integrate, external link-outs, or to be removed from the app?
6. **Legal route.** Move Legal from `/departments/legal` to a `/legal` workspace (proposed), or keep it under Departments?
7. **Departments and Finance tabs.** Which department pages (if any) are planned for the next phase? Until one is live the Departments tab stays hidden. Should vessel Finance own payroll and gratuities, or link to HRIS only (proposed)?
8. **Voice input.** The reference offers a per-vessel voice input module in the top bar. In scope for STORM, and if so in which phase?
9. **Roadmap visibility.** Should owners/admins be able to see planned pages ("Show roadmap"), or should planned pages be invisible to every tenant user?
