# Phase 2 Specialist Audit — Accessibility (a11y)

Read-only audit of `/home/user/maritime-master`. All findings below are derived from direct source inspection (grep/read across the 34 `src/modules/**` feature modules plus `src/shared/components/layout` and `src/index.css`), cross-checked with counts where the pattern is claimed to be systemic. Contrast ratios were computed programmatically from the exact HSL values in `src/index.css` using the WCAG relative-luminance formula (not eyeballed). No files were modified.

Where a suspected pattern turned out, on inspection, to already be handled correctly (e.g. `CrewFormModal.tsx` uses shadcn's `Form`/`FormLabel` pattern, not raw unlabeled inputs; `Tabs`/`DialogTitle` are used correctly in the overwhelming majority of cases), it is noted only as a false-positive ruled out, not written up as a finding.

---

## 1. Semantic structure / heading hierarchy

### [A11Y] — Duplicate `<h1>` on every page that renders its own page title
Severity: High
Location: `src/shared/components/layout/PageLocationHeader.tsx:51` (renders `<h1>{page.title}</h1>` unconditionally) rendered by `src/shared/components/layout/DashboardLayout.tsx:231-233` inside `<main>`, for **every** route in the app; plus 135 of 257 page files under `src/modules/*/pages/**` that additionally render their own `<h1>` (e.g. `src/modules/dashboard/pages/Dashboard.tsx:76`, `src/modules/crew/pages/CrewDashboard.tsx`, `src/modules/incidents/pages/Incidents.tsx`, `src/modules/certificates/pages/Certificates.tsx`, `src/modules/maintenance/pages/Maintenance.tsx`, `src/modules/vessels/pages/Vessels.tsx`, `src/modules/ism/forms/pages/FormSubmission.tsx`, `src/modules/new-build/pages/Timeline.tsx`, and ~127 more).
Description: `DashboardLayout` (the shell wrapping every authenticated route) always renders `PageLocationHeader`, which itself always renders an `<h1>` with the resolved page title, immediately before `{children}`. This is a reasonable, correct single point of truth for the page's `h1` — except that 135 of the 257 page components it wraps (53%) *also* define their own `<h1>` for what is functionally the same page title (confirmed by grep: `grep -rl "<h1" $(find src/modules -path "*/pages/*" -name "*.tsx")` → 135 files). The result is two `<h1>` elements in the rendered DOM on the majority of pages in the app.
Impact: Screen-reader users navigating by heading (NVDA/JAWS "H" key, VoiceOver rotor) land on two "top-level" headings per page and cannot rely on the first `<h1>` as the unique page title; the programmatic document outline is wrong on the majority of routes. This is a repo-wide, systemic defect, not a one-off.
Suggested fix: Remove the page-local `<h1>` from all 135 files and let `PageLocationHeader`'s `<h1>` be the sole page title (demoting any duplicated text to a `<p>`/subtitle, or dropping it if truly redundant with the breadcrumb title). Alternatively, if per-page control over the title text is needed, make `PageLocationHeader` accept the title as a prop from the page instead of both rendering independently. Add an ESLint/test rule (e.g. extend `src/test/config/sitemapTargets.test.ts` or a new render-smoke test) asserting exactly one `<h1>` per rendered route to prevent regression.

### [A11Y] — Heading hierarchy routinely skips from `h1` straight to `h3` with no `h2`
Severity: Low
Location: Repo-wide. `<h2>` appears only 110 times across `src/modules/**`, versus 588 uses of `<CardTitle>` (which renders as `<h3>`, see `src/components/ui/card.tsx:17-22`) and 149 raw `<h3>`.
Description: Nearly every page's content is organized into shadcn `Card`s, whose `CardTitle` renders `<h3>`. Because `<h2>` is rarely used as a section-level heading between the page's `<h1>` and these card titles, most pages jump directly from heading level 1 to level 3.
Impact: Assistive-technology users relying on heading level to understand nesting/structure encounter a level skip on most pages; this is a WCAG "Info and Relationships" best-practice violation (non-blocking, but degrades navigability at scale given how many pages are affected).
Suggested fix: Where a page has multiple `Card`-based sections under one `h1`, wrap each logical section in an `<h2>` (visually styled to match current design if needed) and let `CardTitle`/`h3` nest under it, or add an `as="h2"` override prop to `CardTitle` for section-level cards.

### Positive note
The shared shell (`DashboardLayout.tsx`) does provide correct landmark structure: `<aside aria-label="Main navigation">`, `<header>`, `<main>`, and `SidebarNavigation`/`ModuleTopNav` both render `<nav aria-label="...">`. Only one `<main>` exists per page (pages themselves never redeclare it), which is correct.

---

## 2. Form labeling

### [A11Y] — Search/filter `<Input>` fields rely on `placeholder` text alone, with no `<Label>` or `aria-label`
Severity: Medium
Location: Systemic pattern, 88 of 99 repo-wide `<Input placeholder="...">` usages (grep: `<Input[^>]*placeholder=` minus lines containing `aria-label`/`id=`). Representative instances: `src/modules/hris/components/disciplinary/DisciplinaryOverview.tsx:108`, `src/modules/hris/components/reviews/ReviewsOverview.tsx:240`, `src/modules/hris/components/objectives/ObjectivesOverview.tsx:143`, `src/modules/hris/components/compensation/PayrollCostOverview.tsx:146`, `src/modules/hris/components/recruitment/VacanciesOverview.tsx:138`, `src/modules/hris/components/recruitment/CandidatesTable.tsx:73`, `src/modules/hris/components/onboarding/JoinersTable.tsx:43`, `src/modules/new-build/pages/interior/InteriorMaterials.tsx:874`.
Description: These are all "Search crew, incident, outcome…"-style filter boxes: a bare `<Input>` with a `placeholder` and a `value`/`onChange` pair, no wrapping `<Label>`, `htmlFor`/`id` pairing, or `aria-label`. Per WCAG technique F68 / H91, placeholder text is not a substitute for a programmatic label — some assistive tech does fall back to it for the accessible name, but it disappears once the user types, isn't picked up by "list form fields" navigation in all screen readers consistently, and fails automated audit tools (axe/WAVE) as a best-practice violation.
Impact: Screen-reader/voice-control users tabbing to these search boxes after having typed something (or when the AT doesn't fall back to placeholder) get an unlabeled edit field; this repeats identically across HRIS (disciplinary, reviews, objectives, compensation, recruitment, onboarding) and other modules (new-build), so the same fix needs to land in ~9+ near-duplicate component files.
Suggested fix: Add `aria-label="Search ..."` (matching the placeholder text) to each of these `Input`s, or wrap them in a visually-hidden `<Label>`. Since the pattern is copy-pasted, consider a small shared `<SearchInput placeholder="..." aria-label="..." />` wrapper component to fix it once and prevent recurrence.

### [A11Y] — ISM/SMS dynamic form builder: repeatable "table" field type has no accessible name per cell
Severity: Low
Location: `src/modules/ism/forms/components/FieldRenderer.tsx:376-408` (the `table` field type's per-row, per-column `<Input>`/`<Checkbox>` cells)
Description: The dynamic form engine used for ISM/SMS form templates (`FieldRenderer.tsx`) correctly pairs `<Label htmlFor>` with `id` for every scalar field type (text, textarea, number, date, datetime, time, checkbox, yes/no, yes/no/na, dropdown, file) — this is a well-built reference implementation. The one exception is the repeatable `table` field type: each row's cell inputs (`Input`/`Checkbox` at lines 379-407) have no `id`, `aria-label`, or association with their column header (`col.label` is rendered as a plain `<div>`, not a `<th scope="col">` or referenced via `aria-labelledby`).
Impact: Any ISM/SMS form template that uses a table/grid field (used for multi-row checklists, e.g. drill logs, equipment inspection rows) presents every cell to a screen reader as an unnamed "edit text"/"checkbox" with no indication of which column it belongs to.
Suggested fix: Generate a stable `id` per cell (e.g. `${field.id}-${rowIndex}-${col.id}`) and either an `aria-label={`${col.label} (row ${rowIndex + 1})`}` or wire the header row as real `<table>`/`<th>` markup with `scope="col"` and `headers` attributes on cells.

### False positive ruled out
`src/modules/crew/components/CrewFormModal.tsx` (the crew add/onboarding form) has zero raw `<Label>` elements but is fully accessible: it uses shadcn's `Form`/`FormField`/`FormItem`/`FormLabel` (react-hook-form + zod) pattern, which wires `htmlFor`/`aria-describedby` automatically (12 `FormLabel` / 11 `FormField` usages). Legal's `IntakeWizard.tsx` and the HRIS onboarding `TemplateEditorDialog.tsx`/`StartOnboardingDialog.tsx` were also spot-checked and correctly pair `<Label htmlFor>` with input `id`s.

---

## 3. Custom shadcn/Radix component usage & ARIA

### [A11Y] — Clickable `Card` components used as buttons/navigation with no keyboard access or interactive role
Severity: Medium
Location: 8 confirmed instances: `src/modules/new-build/pages/interior/InteriorMaterials.tsx:655`, `src/modules/ism/forms/pages/SubmissionsList.tsx:118,126,134,142`, `src/modules/dashboard/components/VesselDashboardWidgets.tsx:72,234`, `src/modules/documents/components/DocumentCard.tsx:60`.
Description: shadcn's `Card` (`src/components/ui/card.tsx:5-7`) renders a plain `<div>`. These 8 call sites attach `onClick` directly to a `<Card>` (styled with `cursor-pointer`) to perform a navigation or state-change action (e.g. `onClick={() => navigate('/crew')}`, `onClick={() => setDetailMaterialId(m.id)}`, `onClick={() => setFilterStatus('DRAFT')}`) with no `role="button"`, no `tabIndex={0}`, and no `onKeyDown` handler for Enter/Space. None of the four sampled files contain `role="button"` anywhere.
Impact: These cards are completely unreachable and unactivatable via keyboard (Tab skips over a plain `<div>`) and are announced to screen readers as generic, non-interactive containers — despite visually signaling "clickable" via cursor and hover shadow. Affected features include material comparison selection (New Build/Interior), ISM form-submission status filters, dashboard KPI navigation cards, and the shared `DocumentCard` used across the Documents module.
Suggested fix: Either swap the outer element for a real `<button type="button">` (restyled to match `Card`'s appearance) or add `role="button" tabIndex={0]` plus an `onKeyDown` handler that triggers the same action on Enter/Space, matching the pattern already used correctly elsewhere in the app (e.g. the 185 `Dialog`-based modals below).

### [A11Y] — One `Dialog` instance has no `DialogTitle`, so it has no accessible name
Severity: Low
Location: `src/modules/documents/components/DocumentViewerModal.tsx:111-461` (`<DialogContent>` with no `DialogTitle` or `aria-label` anywhere in the file)
Description: Of 186 files using `<DialogContent>` across the codebase, 185 correctly pair it with `<DialogTitle>` (Radix requires this for an accessible name; without it Radix emits a console a11y warning and the dialog has no name). `DocumentViewerModal.tsx` is the single exception.
Impact: Screen-reader users opening a document preview get a dialog announced with no name/purpose ("dialog" only), and the console warning it produces indicates that the intended contract has already been broken here.
Suggested fix: Add a `<DialogTitle>` (visually hidden via the existing `VisuallyHidden`-style pattern if a visible title isn't wanted) naming the document being previewed, e.g. `<DialogTitle className="sr-only">{document.title}</DialogTitle>`.

### Positive notes
`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (`@/components/ui/tabs`) are used consistently for all tabbed interfaces sampled, including two files (`src/modules/incidents/components/IncidentDetailView.tsx`, `src/modules/new-build/pages/Timeline.tsx`) whose `activeTab` state variable name initially looked like a hand-rolled reimplementation but on inspection both correctly import and use the real Radix-backed `Tabs` primitive. No hand-built dropdown/combobox (raw `<div>` option lists) was found anywhere; `Select`/`Command` usage is consistent. Raw `<div onClick>`/`<span onClick>` patterns are rare overall (4 total repo-wide) and the other 3 are harmless `stopPropagation` wrappers around already-interactive children, not button substitutes.

---

## 4. Keyboard navigation / focus management (modals & wizards)

### [A11Y] — Two hand-rolled modal/panel implementations bypass Radix `Dialog` entirely, losing focus trap, Escape-to-close, and focus restoration
Severity: High
Location:
- `src/modules/refit/components/ui-kit.tsx:272-306` — exported `Drawer` component (`<div className="fixed inset-0 z-50 flex">` with a plain `<button aria-label="Close">` as the backdrop), reused via `<Drawer>` in 6 files: `src/modules/refit/components/SimpleModule.tsx`, `src/modules/refit/pages/document-control.tsx`, `src/modules/refit/pages/crew-requests.tsx`, `src/modules/refit/pages/drawings.tsx`, `src/modules/refit/pages/change-orders.tsx`, `src/modules/refit/pages/schedule.tsx`.
- `src/modules/development/pages/CrewTraining.tsx:388-401` — inline "Training History" side panel, same `fixed inset-0` overlay pattern.
Description: Both implement a slide-over panel from scratch instead of using the app's own `Dialog`/`Sheet` primitives (used correctly elsewhere in 185+ files). Neither has `role="dialog"`, `aria-modal="true"`, or `aria-labelledby` wiring the visible title to the container; neither traps Tab focus inside the panel (a keyboard user can Tab straight through to the sidebar/background content behind the overlay); neither moves focus into the panel on open or restores focus to the triggering element on close; neither listens for Escape to dismiss (confirmed by grep — no `keydown`/`Escape` handling near either block).
Impact: Keyboard-only and screen-reader users opening the Refit module's document/crew-request/drawing/change-order/schedule detail panel, or the Crew Training history panel, get a construct that behaves like a modal visually but is not one to assistive technology — focus can silently leave the panel into background navigation while it's still open, Escape does nothing, and screen readers announce no "dialog" role or name at all.
Suggested fix: Replace both with the existing `Dialog`/`Sheet` component (already the app-wide standard, correctly used in 185+ other files) — a `Sheet` in particular already matches the slide-over-from-the-side visual style `Drawer` is trying to reproduce, and gets focus trap, Escape, `aria-modal`, and focus restoration for free.

### Positive note
`DashboardLayout.tsx`'s mobile navigation drawer (`src/shared/components/layout/DashboardLayout.tsx:74-93,126-147`) is a custom (non-Radix) implementation but is one of the better-built pieces in the app: it sets `aria-modal` conditionally, moves focus to the close button on open (`mobileCloseButtonRef.current?.focus()`), restores focus to the trigger on close, and handles Escape — all covered by its own test file (`DashboardLayout.a11y.test.tsx`). It does not appear to implement a full Tab-cycle focus trap (Tab could still reach elements behind the drawer on very wide viewports where the backdrop button doesn't fully overlay), but the rest of the pattern is sound and is the right reference implementation for the two custom modals above to copy. `feedback/components/FeedbackPanel.tsx` also correctly sets `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.

### [A11Y] — No "skip to main content" link anywhere in the app shell
Severity: Medium
Location: `src/shared/components/layout/DashboardLayout.tsx` (entire file — no skip link before the `<aside>` navigation)
Description: Every authenticated route is wrapped by the same `DashboardLayout`, which renders the sidebar `<aside>` (containing the logo, notification bell, collapse toggle, and full module navigation) before the `<main>` content in DOM order, with no bypass mechanism.
Impact: Keyboard users must Tab through the entire sidebar header controls and navigation on every single page load/route change (there are 312 sitemap leaf items across 34 modules, reachable via the sidebar) before reaching the page's actual content — a repo-wide WCAG 2.4.1 "Bypass Blocks" gap.
Suggested fix: Add a visually-hidden-until-focused "Skip to main content" link as the first focusable element in `DashboardLayout`, targeting an `id` on the existing `<main>` element (`src/shared/components/layout/DashboardLayout.tsx:231`).

---

## 5. Icon-only buttons

### [A11Y] — The majority of icon-only buttons have no accessible name (no `aria-label`, no `title`)
Severity: High
Location: Systemic, repo-wide. Of 274 `<Button size="icon">` usages found across `src/modules/**` (multi-line-aware scan of the full opening tag), only 75 (27%) include `aria-label`; 14 more have a `title` attribute only (a weaker fallback, not exposed identically by all AT); **185 (67%) have neither**. Representative confirmed instances (icon-only, zero label of any kind):
- `src/modules/certificates/components/VesselCertificatesTab.tsx:99-107` — three adjacent icon buttons (`Eye`, `Pencil`, `RotateCcw` — view/edit/renew certificate) with no label at all.
- `src/modules/work-rest/pages/WorkRestOverview.tsx:120,139` — month-navigation `ChevronLeft`/`ChevronRight` buttons with no "Previous/Next month" label.
- `src/modules/development/pages/CourseCatalogue.tsx:92,99,312`; `src/modules/crew/components/CrewAttachments.tsx:224,232,244`; `src/modules/crew/components/CrewCertificates.tsx:404,415,423`; `src/modules/red-room/components/RedRoomPanel.tsx:316,332,353,375`; `src/modules/logbooks/components/LogbookAttachments.tsx:198,208`; and dozens more across nearly every module.
Description: These are `Button` components whose only child is a `lucide-react` icon (e.g. `<Eye className="w-4 h-4" />`), with no visually-hidden text, `aria-label`, or `title`.
Impact: Screen-reader users encounter a button announced only as "button" with no indication of what it does (view vs. edit vs. delete vs. renew, previous vs. next, etc.) — for actions as consequential as deleting an attachment or renewing a certificate. This is the single most widespread accessibility gap found in this audit by raw instance count.
Suggested fix: Add `aria-label="..."` (a short verb phrase describing the action, e.g. `aria-label="View certificate"`, `aria-label="Previous month"`) to every icon-only `Button`. Since the pattern repeats identically hundreds of times, consider adding an ESLint rule (e.g. `jsx-a11y/aria-label` combined with a custom rule flagging `size="icon"` Buttons whose only child is a lucide icon and which lack `aria-label`) to catch regressions and the existing backlog in one pass.

---

## 6. Color contrast against the token palette

Contrast ratios below were computed directly from the HSL values in `src/index.css` using the WCAG 2.x relative-luminance formula (sRGB linearization + the standard `(L1+0.05)/(L2+0.05)` ratio), not estimated by eye. WCAG AA requires **4.5:1** for normal text and **3:1** for large text (≥18pt/14pt-bold) or non-text UI components (e.g. a solid-fill icon-only control's boundary). Because the page cannot be rendered in this audit, ratios below 4.5:1 for what appears to be normal-weight running/label text are flagged as likely failures, not certain ones — "needs visual verification" against the actual rendered font sizes.

### [A11Y] — White text on the mid-tone "status/accent" background tokens fails WCAG AA for normal text, and is used as a `text-on-muted-background` badge pattern in 223 files
Severity: High
Location: `src/index.css` `:root` block, lines ~26-95 (`--secondary`/`--secondary-foreground`, `--accent`/`--accent-foreground`, `--destructive`/`--destructive-foreground`, `--success`/`--success-foreground`, `--info`/`--info-foreground`, `--orange`/`--orange-foreground`, `--purple`/`--purple-foreground`, `--cyan`/`--cyan-foreground`, `--pink`/`--pink-foreground`, `--indigo`/`--indigo-foreground`, `--teal`/`--teal-foreground`). Consumed via `text-success`/`text-warning`/`text-info`/`text-critical`/`text-orange`/`text-purple`/`text-cyan`/`text-amber`/`text-pink`/`text-teal` (and the matching `bg-*`) utility classes across 574 occurrences in 223 files (`grep -rc "text-(success|warning|info|critical|orange|purple|cyan|amber|pink|indigo|teal)"`).
Description: Computed contrast ratios (light mode) for each color's base tone against its paired white foreground/background:
| Pair | Ratio | AA normal-text (4.5:1) |
|---|---|---|
| `--secondary` / white | 3.63:1 | Fail |
| `--accent` / white | 3.63:1 | Fail |
| `--info` / white | 3.63:1 | Fail |
| `--destructive` / white | 3.61:1 | Fail |
| `--success` / white | 3.35:1 | Fail |
| `--orange` / white | 2.78:1 | Fail (badly) |
| `--purple` / white | 3.96:1 | Fail |
| `--cyan` / white | 2.43:1 | Fail (badly) |
| `--pink` / white | 3.56:1 | Fail |
| `--teal` / white | 2.40:1 | Fail (badly) |
| `--indigo` / white | 4.43:1 | Fail (marginal) |
| `--critical` / white | 4.80:1 | Pass (marginal) |
| `--warning` / black, `--amber` / black | 9.82:1 | Pass |
Separately, the very common "tinted badge" pattern (saturated text color on that same hue's `-muted` (94%-lightness) background — e.g. `text-success` on `bg-success-muted`) is worse across the board: `success` 3.09:1, `warning` 1.95:1, `info` 3.06:1, `critical` 3.97:1, `orange` 2.45:1, `purple` 3.20:1, `cyan` 2.23:1, `amber` 1.95:1, `pink` 2.95:1, `indigo` 3.52:1, `teal` 2.22:1 — every single one fails AA for normal text, several fail even the relaxed 3:1 large-text/UI-component threshold.
Impact: Status badges, KPI tiles, and category tags built from this palette (used 574 times across nearly every module — crew, HRIS, incidents, maintenance, ISM, certificates, dashboard, etc.) are likely to read as low-contrast, hard-to-read text for users with low vision, and would fail an automated axe/Lighthouse contrast check almost everywhere they appear. This needs visual verification (actual rendered font size/weight affects whether the 3:1 large-text carve-out applies), but the numbers are consistently and substantially below the 4.5:1 normal-text bar, so it is very likely a real, widespread failure rather than a borderline one.
Suggested fix: For any badge/label that renders at normal text size, either darken the base color (increase HSL lightness offset the other way) until it hits ≥4.5:1 against its foreground, or — for the `-muted` badge pattern specifically — keep the saturated color for icons/borders only and use the existing high-contrast `--foreground`/`--*-foreground` pair (which already passes, e.g. `warning`/black, `amber`/black at 9.82:1) for the actual text. Run the existing tokens through an automated contrast linter (e.g. `polychrome`/`colorable`) as part of CI so any future token edits can't silently regress this.

### [A11Y] — Sidebar border/background contrast in dark mode is effectively invisible
Severity: Low (needs visual verification)
Location: `src/index.css` `.dark` block — `--border: 217 33% 17%` against `--background: 222 47% 8%`
Description: Computed contrast ratio is 1.28:1 — the border color is barely distinguishable from the background it sits on.
Impact: If this token is used for a visible separator (e.g. between sidebar sections or as a focus/hover boundary indicator) rather than purely decorative low-emphasis dividers, users with low vision may not perceive the boundary at all in dark mode. WCAG 1.4.11 (non-text contrast, 3:1) would apply to any border conveying a meaningful boundary/state.
Suggested fix: Visually confirm where `--border` is used as a functionally meaningful divider (versus purely decorative) in dark mode, and raise its lightness (e.g. to ~25-28%) if so, to clear the 3:1 non-text-contrast bar.
