# Blueprint build-out: build plan and progress tracker

> This is the work queue for `MASTER-PROMPT.md`. Work items run in phase order. Inside a phase, items in the same **lane** can run in parallel because each lane owns disjoint files.
>
> - Each item names the gap-doc rows it delivers (`gap/NN` + row IDs). The spec is in the gap doc, amended by `DECISIONS.md`.
> - Each item has a **Done when** test. An item is ticked only when that test passes, the four quality gates are green (DECISIONS D-10) and the work is pushed.
> - The tracker at the bottom is the single source of progress. The build loop updates it in the same commit as the work.

Legend: `[ ]` open · `[~]` in progress / partially landed · `[x]` done · `[-]` dropped (reason recorded in DECISIONS).

---

## Phase 0: Platform foundation

**Goal:** everything domain streams depend on, landed before they fork. No change in product behaviour except the new look.

### Lane A: Design system (`gap/10` §A, DS1–DS26; DECISIONS §1)

Owns: `src/index.css`, `tailwind.config.ts`, `index.html`, `src/components/ui/**`, `src/shared/components/{status,states,data}/**`, the `ThemeProvider` mount in `src/App.tsx`, `src/test/design/**`.

| ID | Item | Delivers | Done when |
|---|---|---|---|
| A1 | Abyss raw scales and semantic tokens, dark default, Daylight light theme | DS1–DS3, DECISIONS §1 | `:root` holds the dark set and `.light` (or `:root:not(.dark)`) holds the Daylight set. Every existing semantic variable (`--background` … `--chart-6`, sidebar, the success/warning/info/critical families) is remapped. Tailwind exposes `abyss`, `deep`, `slate-ui`, `drift` and `signal` scales. An AA contrast test checks the token pairs. |
| A2 | Theme runtime | DS4, DS22 | A `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="dark"`, `storageKey="storm-theme"`, `enableSystem`) and an inline pre-paint script in `index.html` give no white flash. `theme-color` is set. The Appearance section writes the theme through the provider. `sonner` reads the theme. |
| A3 | Fonts and type scale | DS6, DS7, DECISIONS D-DS3 | Inter, Barlow Semi Condensed and JetBrains Mono load from Google Fonts. Tailwind has `font-sans`, `font-display` and `font-mono`. There are type-scale utilities. `tabular-nums` is the default in tables and KPI values. |
| A4 | Radius, elevation, glow, focus, motion, density tokens | DS8–DS11 | `shadow-e1`…`e3`, `shadow-glow-signal` and the `focus-ring` utility exist. A global `prefers-reduced-motion` rule is in place. A `data-density` attribute drives row heights. |
| A5 | Primitives restyled | DS19 | Dialog, sheet, drawer and alert-dialog use the overlay token and elevation. Tabs are underlined with a Signal indicator. Toast tones come from status tokens. Inputs have 3:1 borders. Buttons and badges get Abyss-on-Signal fills. |
| A6 | `StatusPill`, `statusTone()` registry, whose-move chip, expiry-tier pill | DS12, DECISIONS C5 | `src/shared/components/status/` exports these with unit tests. The registry covers the status vocabularies of incidents, audits, training, risk assessments, corrective actions, work-rest, certificates, crew and support. |
| A7 | `KpiTile`, `EmptyState` and page states | DS13, DS16, `gap/00` D7 | `KpiTile` handles the loading, zero, not-enabled and error states. `src/shared/components/states/` exports `PageLoading`, `PageError`, `PageEmpty`, `AccessDenied`, `ModuleOff` and `VesselArchived`. Health re-exports from them. |
| A8 | `DataTable` and `MatrixGrid` | DS14, DS15 | Both work with sticky headers, sort, count-chip filters, density and virtualisation over 200 rows. They have tests and are adopted by one real page each. |
| A9 | Map theming and chart palette | DS17, DS18 | A shared `mapTheme` follows the theme, with no white Leaflet popups. The chart palette has been validated in both themes. |
| A10 | Palette ratchet | DS21, D-10 | `src/test/design/paletteRatchet.test.ts` keeps a per-file baseline. Counts may only go down. |

### Lane B: Router, scopes and registry (`gap/00` A2, B1–B8, D2, E1–E2; `gap/01` F9, F14; DECISIONS D-02, D-03, D-06, D-13)

Owns: `src/app/**`, `src/routes/index.tsx`, `src/config/**`, `src/modules/vessels/{contexts,lib}/**`, the `ShellContext` part of `src/shared/components/layout/DashboardLayout.tsx`, `src/integrations/supabase/pending.ts`, `supabase/MIGRATIONS-LEDGER.md`, `src/test/config/**`.

| ID | Item | Delivers | Done when |
|---|---|---|---|
| B1 | Dead code removed and the Refit double-slug fixed | `gap/00` A5, B7; `gap/10` IA11, IA22 | The listed dead files are gone. Refit leaves open their real pages. A test rejects repeated consecutive path segments. |
| B2 | `lazyPage` helper with lazies hoisted | `gap/00` B1 | `grep -c "React.createElement(React.lazy" src/routes/index.tsx` returns 0. There is one Suspense fallback and a per-route error boundary. |
| B3 | Nav node fields: `status`, `scope`, `capability`, `badgeKey`, `moduleSetting`, and `kind: 'section'` | `gap/10` IA6, IA10; D-06 | Planned leaves are hidden unless "Show roadmap" is on, and their placeholder routes are kept. A test proves no planned leaf shadows a real route. |
| B4 | Vessel code derivation and scoped path builders | D-03; `gap/00` B4 | `getVesselCode()`, `vesselPath(code, rel)` and `useScopedPath()` exist, with unit tests for collisions and prefixes. |
| B5 | Scope layout routes: `FleetScope`, `VesselScopeRoute`, `PersonalScope`, `WorkspaceScope`, and an idempotent `DashboardLayout` via `ShellContext` | `gap/00` B2, B3; `gap/01` F14; D-02, D-13 | `/fleet/*`, `/v/:vesselCode/*` and `/me/*` render existing pages. `VesselScopeRoute` resolves the code case-insensitively, sets `VesselContext`, renders 404 for an unknown code and `AccessDenied` for no reach. Navigating between pages in one scope does not remount the shell (test). |
| B6 | Legacy redirects table | `gap/00` B5; `gap/01` legacy list; R3, R8 | `legacyRedirects.ts` is data only. A test checks that every old `existing` sitemap path still resolves, by redirect or by route. |
| B7 | Target nav tree | `gap/10` IA7, R1 | The Fleet sidebar has OVERVIEW, COMPLIANCE, PEOPLE, WORKSPACES, ADMINISTRATION and CONFIGURATION. The vessel module tree feeds the tab row. Workspaces are unchanged. Sitemap tests are updated. |
| B8 | Module manifest registry (`module.ts` + `import.meta.glob`) with converted modules | `gap/00` A2, B8 | HRIS, Health, Legal, Refit and New Build register through manifests. The sitemap assembler merges nav fragments into slots. Registry invariant tests pass. |
| B9 | Pending-table shim and ratchet | `gap/00` D2 | `pending.ts` and per-module `types/db.pending.ts` exist. Refit uses the shim. The ratchet test passes. |
| B10 | Migration ledger and migration invariants test | `gap/00` E1, E2; D-01, D-12 | `supabase/MIGRATIONS-LEDGER.md` lists the hand-written files and their status. The test fails on a new duplicate version or a non-idempotent `CREATE`. |

### Lane C: Access adaptor and engine interfaces (`gap/00` C1–C3, D5; `gap/08` interfaces; DECISIONS D-04, D-05)

Owns: `src/lib/**` (new `permissions/`, `records/`, `export/`, `storage/`), `src/shared/lib/{notify,form}.ts`, `src/shared/components/ModuleRoute.tsx`, the fail-closed fix in `SidebarNavigation.tsx`.

| ID | Item | Delivers | Done when |
|---|---|---|---|
| C1 | Interim `useCan(key)` / `<Can>` adaptor; generic `capability` guard on `ModuleRoute`; nav fails closed | `gap/00` C1–C3; D-04 | PMS keys map to today's module and level checks. Unknown key → false. Loading → false. Tests cover each case. |
| C2 | `notify` wrapper (sonner) and form helpers (`blankToNull`, date-only, zod field helpers) | D-05; `gap/00` D5 | Wrapper and helpers exist with tests. New code uses them. |
| C3 | Pure engine libraries: `expiryBucket()`, `formatReference()`, signature-slot order logic (sign as / pass to / reverse remove / stale detection), whose-move computation, and the record-kind registry types | `gap/08` SIG*, REG*, EXP*; C5, C21, G7 | Pure TypeScript in `src/lib/records/`, with tests mirroring the state machines in `gap/08`. No DB dependency. |

**Phase 0 exit:** A1–A7, B1–B7 and C1–C3 are done. A8–A10 and B8–B10 may trail into Phase 1.

---

## Phase 1: Shell facelift (`gap/10` IA1–IA26; `gap/01` §C)

Owns: `src/shared/components/layout/**`, `src/modules/vessels/components/VesselSelector.tsx` (replaced) and the sign-in pages' presentation.

| ID | Item | Delivers | Done when |
|---|---|---|---|
| S1 | `AppShell` with a `scope` prop and the new `TopBar`: logo or plate, scope control, vessel switcher (cmdk, recent, groups, alert and AIS dots, sub-path preserving), Apps, search trigger, favourite star, help, bell, account | IA1–IA5, IA13–IA16, IA23 | Fleet, vessel, workspace and personal scopes each render the right chrome. The switcher keeps the sub-path. The bell has moved to the top bar. Playwright screenshots are taken in dark and light. |
| S2 | Vessel module tab row | IA5 | Tabs are filtered by module settings and capability, with a sliding Signal indicator, overflow "More" and "← Fleet". |
| S3 | Fleet sidebar with section headings, badges and collapse | IA6, IA7, IA20, IA21 | Matches the `gap/10` tree. Badges come from the registry. |
| S4 | Per-vessel module visibility and label overrides in the nav (reads `vessel_module_settings`; when the table is missing, all modules are on) | IA9; C13; D-01 | Turning a module off hides its tab, sidebar leaves and routes (`ModuleOff`). The Charter/Trip label override works. |
| S5 | Command palette (⌘K) over pages, vessels and actions; records by reference later | IA12 | ⌘K opens the palette. Results respect nav visibility. |
| S6 | Sign-in, reset and first-paint screens on Abyss; mobile and tablet shell; PWA manifest | DS22, IA19, IA26 | No white flash. 44 px targets. Usable at 390 px width. |
| S7 | Colour migration for the shell, dashboard, crew list and the top 20 files by palette-hit count | DS20, `gap/10` C.2 | The palette ratchet baseline is reduced. Screenshots are clean in both themes. |

---

## Phase 2: Platform data foundation (migrations written, idempotent, ledgered; DECISIONS D-01)

Owns: platform migration block `00`–`03`, `supabase/functions/_shared/**`, `src/lib/records/**` services, and `src/modules/auth/**` (access owner).

| ID | Item | Delivers | Done when |
|---|---|---|---|
| P1 | Vessel tenancy columns (`code`, `short_code`, `lifecycle_status`, `is_counted`, `vessel_purpose`) backfilled with the D-03 derivation | `gap/01` F9, C2, C20 | The migration is idempotent and listed in the ledger. The client prefers `vessel.code` when it is present. |
| P2 | `account_memberships`, `user_vessel_reach()` / `user_can_reach_vessel()`, `vessel_module_settings` + `company_module_settings`, `format_reference()` | `gap/01` F11, F21; C16, C21 | Each helper is SECURITY DEFINER, has a TS mirror and tests, and is in the ledger. |
| P3 | Security fixes: honest invite status, reset/resend emails actually sent, disabled users blocked at sign-in, the `permission_audit_log` insert policy, RLS on vessels/roles/overrides | `gap/01` P0 security rows; `gap/03` D-rows | Each fix has a test or SQL assertion, and the edge functions use `_shared/auth.ts`. |
| P4 | Record engine tables: `record_kinds`, `record_envelopes`, `record_events`, `record_signatures`, `record_threads`/entries, `file_objects`, `record_attachments`, `record_links`, `export_jobs`, `record_transition()` | `gap/08` REG, SIG, THR, AUD, UPL, EXP; C7–C10, G7 | Migrations are written and ledgered. The TS services use the pending shim and the C3 pure libraries. |
| P5 | Notification outbox + `emit_notification_event()` + inbox behind the bell (deep links) | `gap/03` N-rows; `gap/08` notify | The bell reads the inbox, and links open the exact record in the right scope. |
| P6 | Edge `_shared` helpers (cors, json, auth, `assertCapability`) and the `verify_jwt` policy | `gap/00` C6, F1, F2 | New functions use the helpers, and the existing invite and admin functions are migrated. |

---

## Phase 3: Domain streams (parallel; each owns `src/modules/<module>/**`, its migration block and its tests)

Streams run two at a time (the build box has 4 CPUs). Each stream works through its gap doc's P0 rows, then its P1 rows. Pages go live behind `status: 'beta'` and capability gates. A stream may not edit the hotspot files listed in `gap/00` §2; it requests changes from the platform owner instead.

| Stream | Gap doc | Migration block | First deliverables (P0) |
|---|---|---|---|
| **X1 Crew** | `gap/04` (+ `gap/02` training/medical) | `06` | Vessel-scoped crew list; routed 9-tab profile; document-type catalogue + verification; required-qualifications matrix + compliance page; HoR vessel board + breach review; controlled transfer; positions seed (C22) |
| **X2 Safety / SMS** | `gap/05` (+ `gap/09` themes K, L, M, O) | `07` | SMS summary; SMS forms register on the record envelope; incidents; corrective actions; drills catalogue/schedule/matrix/completion; permit-to-work framework; risk assessments; medical case; HESS meeting; vessel-scoped RLS |
| **X3 Certificates and Technical** | `gap/06` | `08` | Data-driven certificate sections; status buckets; versions and related documents; verification; job register + state machine + recurrence; complete-job transaction; job detail; equipment register + critical equipment list; per-vessel sub-module switches |
| **X4 Voyage, Charter, Calendar, Reports** | `gap/07` (+ `gap/02` reports/calendar) | `09` | Voyage lifecycle + movement reports; parallel draft plans; passage plans + acknowledgements; voyage checklists; vessel reports hub + `ReportShell`; compliance pack; fuel grades; the security fixes in that doc |
| **X5 Fleet operations** | `gap/02` | `04` | Expiry engine + Document Alerts KPI; fleet document publish & acknowledge; document taxonomy; Fleet Reports hub; dashboard rebuild; forms & checklists by area; course catalogue + training applications; fleet medical grid |
| **X6 Fleet administration and support** | `gap/03`, `gap/09` | `05`, `10` | Users & Access tabs (admins, shore staff, matrix with Review & save); notification management; support request detail + workflow + staff triage console; GDPR requests + export; Vessel Settings matrix; Administration sidebar |

**Order** (blueprint build order, `gap/00` §6.4): X1 and X5 (expiry engine) → X3 → X2 → X4 → X6. Two streams run at a time, in isolated worktrees, and merge back through the integration step.

---

## Phase 4: Hardening and completion

| ID | Item | Done when |
|---|---|---|
| H1 | Colour migration for all remaining modules | The palette ratchet is at or near 0 outside the allow-list. |
| H2 | Mocked pages replaced or set to `planned` (`gap/00` K1) | There are no hard-coded record arrays in `pages/`. |
| H3 | Lint warning ratchet and strict tsconfig for new modules (`gap/00` I2, I3) | CI enforces both. |
| H4 | `docs/<MODULE>.md` for every rebuilt module (`gap/00` A4) | Each module doc covers routes, access, tables, engines and go-live steps. |
| H5 | Full blueprint coverage re-audit (re-run the gap workflow against the new code) | Every P0 row is complete or explicitly dropped in DECISIONS. Every P1 row is complete, scheduled or dropped. |

---

## Progress tracker

Updated by the build loop in the same commit as the work. Newest last.

| Date | Item(s) | Commit | Notes |
|---|---|---|---|
| 2026-11-22 | Gap series 00–10, critic 99, DECISIONS, BUILD-PLAN, MASTER-PROMPT | (this commit) | Baseline: lint 0 errors / 839 warnings; typecheck OK; 938/938 tests; build OK |
| 2026-11-22 | Phase 0: A1–A10, B1–B10, C1–C3; visual harness | `4e10708` (Lane C), `00ca0a1` (Lane A), `9e42f7a` (Lane B), `c22ae13` (visual harness), `1bf6fac` (integration) | Gates: lint 0 errors / 814 warnings (baseline 839); typecheck OK; 2600/2600 tests in 122 files; build OK. Visual harness: 92/92 graded ok by the harness at the time, which did not yet check skeletons, overflow or request volume (grading fixed in the Phase 0 audit) (23 routes × dark/light × 1440/390, incl. `/fleet/dashboard`, `/fleet/tracker`, `/v/dra`, `/v/dra/crew/list`, `/v/dra/safety`, `/v/hyd/certificates`, `/me`). Palette ratchet 268 files / 2689 palette / 108 hex / 270 `dark:` at seed → 265 / 2669 / 104 / 266. Decisions D-19–D-29. Owner actions: undeploy the `sign-submission` edge function (source removed); P1 must land before P3 tightens vessel RLS (D-25); Phase 2 adds `user_preferences.density`/`show_roadmap` and a `dark` theme default (D-19, D-29). Open: `/me/<section>` is not URL-routed yet (Settings keeps its section in state); the legacy compatibility layer stays until H1. |
| 2026-11-22 | Phase 0 audit round 1 | `71620cd` | Gates: lint 0 errors / 773 warnings (ceiling 814); typecheck OK; 3095/3095 tests in 142 files; build OK; harness node tests 29/29 (now in CI). Visual spot-check: 48 captures (12 touched routes × dark/light × 1440/390): 44 ok, 4 warn (`/v/dra/logbooks` redirects to the official log by design; the official-log table overflows `main`, left to the logbooks stream). Fixed all 48 confirmed findings (2 high, 14 medium, 32 low): menu highlight contrast, incident-analytics refetch loop, stale vessel scope on user switch, fabricated tracker data, print/compat/sidebar contrast, legal signature ink, chunk-reload loop, in-scope legacy links, redirects dropping query and hash, record-engine rules (D-25 codes, time zones, close-as, void, on-behalf, signature idempotency) and tooling gaps. Decisions D-30–D-50. Deferred: module bar offers the Fleet tab to vessel-only users, then FleetScope denies them (Phase 1); `/me/training` opens with the HRIS sidebar because SidebarNavigation adds `?module=hris` to cross-links (S2); users-access and official-log tables at 390 px (module streams); 24 undefined Refit colour names on a shrink-only list (D-40); B9 and C2 stay `[~]`. Owner: confirm D-30 (D-50); review the shared demo password in `refit/pages/login-help.tsx`. |
| 2026-11-22 | Phase 0 audit round 2 | `17dfe2a` | Gates: lint 0 errors / 773 warnings (ceiling 814); typecheck OK; 3194/3194 tests in 143 files; build OK; harness node tests 29/29. Visual spot-check: 32 captures (8 touched routes × dark/light × 1440/390, incl. `/fleet/reports/incident-analytics`, `/notifications/center`, `/review-queue`, `/fleet/nonexistent`, `/v/dra/nonexistent/thing`): 32 ok. Fixed all 8 confirmed findings (2 medium, 6 low): status `-foreground` text on tints and outlines (scan added), Recharts defaults on dark, 44 px touch floor in every density, same-tab user switch serving the previous user's vessels and roles (D-41), in-scope 404 breadcrumb, sticky company acknowledgement locking vessel signatures after Return / Reopen (per-cycle lock), and gaps in the migration-invariant and pending-cast ratchets (allow-list re-seeded to 37 files / 149 casts). Decisions D-51–D-55; D-35 amended. Deferred: none. Owner / server: `record_transition()` and `remove_signature()` need matching `cycle`, `acknowledged_cycle` and `initial_report_acknowledged` columns when the envelope migration is written; retire `new-build/lib/supabase.ts` (`any` handle) in the new-build stream. |
| 2026-11-22 | Phase 0 audit round 3 | `c1333b0` | Gates: lint 0 errors / 773 warnings (ceiling 814); typecheck OK; 3306/3306 tests in 146 files; build OK. Visual spot-check: 24 captures (6 touched routes × dark/light × 1440/390: `/fleet/tracker`, `/fleet/calendar`, `/itinerary/planning`, `/v/dra`, `/notifications/center`, `/fleet/dashboard`): 24 ok. Fixed all 6 confirmed findings (3 medium, 3 low): RBAC store hanging scoped routes on a failed `getUser()` (now reads the stored session, bounded retry), tracker/itinerary vessel selects sharing `useVessels`' cache key (blank profile, Edit Profile nulling particulars), unreadable Recharts default tooltip item text (and `:where()` chart defaults), notification bell severity tones in `--accent` (one tone map), and fail-open gaps in the any-handle importer and migration-statement ratchets. Decisions D-56, D-57; D-53 amended. Deferred: none. Open: `SEVERITY_COLORS` in `alerts/constants.ts` still disagrees with D-57 (alerts module stream); a shell Retry affordance on the RBAC `error` (Phase 1). |
| 2026-11-22 | Phase 1 build (S1–S7) | `f2c4a8f` (S1), `353997b` (S2–S4), `96900e7` (S5), `2f902ea` (S6 sign-in, first paint, PWA), `332e037` (S6 heading contract, personal routes, mobile shell), `e712e56` (S7), `7adb491` (visual harness) | Gates: lint 0 errors / 772 warnings (ceiling 773); typecheck OK; 3878/3878 tests in 185 files; build OK; harness node tests 50/50 (`node --test scripts/visual/test/*.test.mjs`; the actions suite now runs in CI). Palette ratchet 265 files / 2669 palette / 104 hex / 266 `dark:` → 225 / 1705 / 82 / 88, locked with `--write`. Visual: full run of 61 routes (dark/light × 1440/390, width-limited interaction captures) = 224 captures: 216 ok, 8 warn (4: `/fleet/admin/users/crew` table overflowing at 390, fixed and re-captured 24/24 ok; 4: the `rbac-error` persona's missing role RPCs log 404s by design); 768/1024 run for `/fleet/dashboard`, `/v/dra`, `/v/dra/crew/list`, `/me` and the drawer, tab-row More, favourites, help and Apps captures: 32 captures, 30 ok, 2 warn (More at 1024, where every tab fits; the route is now 768-only). Integrator fixes after review: tab-row fit ignored the rail padding (More label ran into "← Fleet" at 768), footer floated mid-page on short pages, vessel home kept its own Vessel/Fleet toggle and a second refresh inside the vessel scope, emergency-contact empty state and users-access rows overflowed at 390; `PopoverAnchor` and `SheetContent hideClose` added to the primitives; route-level `widths` in the harness. Decisions D-58–D-82. Deferred: theme-aware tertiary text token (footer stays `muted-foreground`, D-80); Settings sections to `PageHeader` (D-79); People in the palette and record providers (Phase 3); nav children providers ship with their streams (IA24); footer tagline waits for C14 (IA18); `VesselContext` `useVessel` export (react-refresh warning, 100+ importers). Open (module streams): Red Room panel shows "No Urgent Actions Required" on an empty or failed load while red alerts exist (fake success); `/me/hours-of-rest` has a `<div>` inside `<p>`; the HRIS landing `/hr` is still a legacy route (no workspace chip); the vessel dashboard RPC fixture returns the aggregate row, so `/v/<code>` captures title "All vessels". |

### Phase status

- Phase 0: Lane A `[x]` A1–A10 · Lane B `[x]` B1–B8, B10 · `[~]` B9 · Lane C `[x]` C1, C3 · `[~]` C2
  - B9 `[~]`: the shim, `refitDb` and the cast ratchet exist, but Refit pages still use the untyped `db` handle (94 casts in 21 allow-listed Refit files since the audit round 2 re-seed, which counts `any`-typed client aliases; 13 files import `db` as a value). `src/test/config/anyClientHandles.test.ts` pins the importers of every `any`-typed client handle (shrink only): refit's `db` (13 files) and new-build's `supabase` (28 files); a new any-typed handle fails. "Refit uses the shim" is met when refit's list is empty.
  - C2 `[~]`: `notify` and the form helpers exist with tests. "New code uses them" is pending adoption by the first Phase 1/3 form; `notify` is now used by Appearance (theme save error), `form.ts` has no production caller yet.
- Phase 1: `[x]` S1–S7
  - S4: verified against the pending `vessel_module_settings` table through harness fixtures (missing table = all modules on, D-63); it acts on live data once its migration is applied.
  - S6: no white flash in the app's own paint (boot, reload, watchdog and recovery screens follow the stored theme in both OS schemes); Chromium can still show one default-canvas frame before the document paints when the OS scheme differs from the stored theme.
  - Partial by design, recorded in DECISIONS: IA18 footer tagline (C14), IA24 nav children providers (Phase 3 streams), palette People group and record providers (Phase 3).
- Phase 2: `[ ]` P1–P6
- Phase 3: `[ ]` X1 · `[ ]` X2 · `[ ]` X3 · `[ ]` X4 · `[ ]` X5 · `[ ]` X6
- Phase 4: `[ ]` H1–H5
