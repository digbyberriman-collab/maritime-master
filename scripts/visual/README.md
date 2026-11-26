# Visual and route-smoke harness

A reviewer tool, not a CI gate. It starts the Vite dev server against a **mocked Supabase**, signs in a fixture fleet manager, opens each route in `routes.json` in each theme and viewport, and saves:

- one screenshot per capture
- a JSON report: console errors, page errors, error boundaries, blank pages, the final URL after redirects, and which tables had no fixture
- a summary table in the terminal

The live Supabase project cannot be reached from the build box (DECISIONS D-01), so nothing here touches a real backend.

## Run it

```bash
# Everything in routes.json: dark + light, 1440x900 + 390x844
node scripts/visual/capture.mjs

# A quick look: three routes, dark only, desktop only
node scripts/visual/capture.mjs --routes dashboard,crew-list,ism-incidents --themes dark --widths 1440

# A route that is not in routes.json yet (any path starting with "/")
node scripts/visual/capture.mjs --routes /fleet/overview --themes dark,light

# The command palette open, and with a query typed (scripted actions)
node scripts/visual/capture.mjs --routes palette-open,palette-query --widths 1440,390

# Any route as another user or data state (a persona)
node scripts/visual/capture.mjs --routes /v/dra --persona vessel-master

# List the routes, their slugs and the file each comes from
node scripts/visual/capture.mjs --list

# Without the fixture overlays (fixtures.d), or with another overlays folder
node scripts/visual/capture.mjs --routes /v/dra/crew/list --no-overlays
node scripts/visual/capture.mjs --routes /v/dra/crew/list --overlays /path/to/overlays
```

Output goes to `.visual/` (git-ignored; never commit screenshots):

```
.visual/<theme>-<width>-<slug>.png    e.g. .visual/dark-1440-crew-list.png
.visual/report.json                   per-capture details (see below)
.visual/vite.log                      dev-server output
.visual/.cache/fonts/                 cached Google Fonts
```

A full run (16 routes × 2 themes × 2 widths) takes a minute or two.

### Requirements

- Playwright and Chromium. They are installed globally on the build box, and the harness finds them there. Playwright is deliberately not a project dependency: adding one means updating both lockfiles (D-16).
- `curl`, to fetch Google Fonts (see "External requests").

### Options

| Flag | Default | Meaning |
|---|---|---|
| `--routes a,b` | all | Slugs or paths from `routes.json` and `routes.d/`; an unknown `/path` is captured ad hoc |
| `--themes dark,light` | both | Sets `localStorage['storm-theme']` and `prefers-color-scheme` |
| `--widths 1440,390` | both | 1440→900 and 390→844 tall; other common widths have device heights. Widths under 768 emulate a touch phone |
| `--no-server` | off | Use a server that is already running at `--base-url` |
| `--base-url URL` | `http://127.0.0.1:4319` | App origin |
| `--supabase-url URL` | `http://127.0.0.1:54399` | Supabase origin to mock |
| `--out DIR` | `.visual` | Output directory |
| `--full-page` | off | Full-page screenshots instead of the viewport |
| `--concurrency N` | 1 | Captures in parallel (2 is fine on a 4-CPU box) |
| `--external MODE` | `fonts` | `fonts`: Google Fonts fetched by the harness, other externals stubbed. `block`: stub everything. `live`: let the browser go out |
| `--timeout MS` | 45000 | Navigation timeout per capture |
| `--settle MS` | 400 | Pause before each screenshot |
| `--strict` | off | Exit 1 when any capture fails (still not a CI gate) |
| `--persona NAME` | none | Capture every selected route as this persona (see "Personas"); wins over a route's own `persona` |
| `--routes-file`, `--fixtures` | `scripts/visual/…` | Use another routes file (its sibling `routes.d/` is read too) or fixtures folder |
| `--overlays DIR` | `<fixtures>/../fixtures.d` | Fixture overlays: a folder of overlay folders, or one overlay folder (see "Overlays"). A named folder must exist |
| `--no-overlays` | off | Base fixtures only |
| `--list` | off | Print the selected routes with the file each comes from (`[routes.json]`, `[routes.d/crew.json]`) and exit |

### Using a server you started yourself

The harness normally starts `npx vite --config scripts/visual/vite.visual.config.mjs --port 4319 --strictPort` with these settings:

- `VITE_SUPABASE_URL=http://127.0.0.1:54399`
- `VITE_SUPABASE_PUBLISHABLE_KEY` set to a fake JWT-shaped key

To keep a server running between runs, start it the same way and pass `--no-server`. You can also point the mock at any Supabase URL with `--supabase-url`. For example, run your usual `npm run dev` (port 8080, real project URL from `.env`) and add `--no-server --base-url http://localhost:8080 --supabase-url https://<project>.supabase.co`. Every request to that origin is then answered by the mock, so nothing reaches the real project.

The visual Vite config is the app's own config with two differences:

- **Private dependency cache** (`node_modules/.vite-visual`), so it never collides with another dev server or vitest run. It lives under `node_modules` so `eslint .` never lints the optimised bundles.
- **HMR off.** An edit elsewhere in the working tree cannot reload a page in the middle of a capture. Each capture is a fresh page load, so it still picks up the latest files.

## What the report says

Each capture gets a status:

| Status | When |
|---|---|
| `fail` | The ErrorBoundary rendered ("This part of the page failed to render"), the page was blank, the stale-chunk recovery panel showed, an uncaught page error fired, navigation failed, a signed-in route ended on `/auth`, or two top-bar controls collide (see "Top-bar collisions") |
| `warn` | Console errors, "Something went wrong" text outside the boundary, an AccessDenied card, a spinner or skeleton (`aria-busy`) that never cleared, a wait that gave up (network never idle, `waitFor` selector not found, screenshot failed), more than 500 mock requests in one capture ("runaway fetching"), horizontal overflow of `main` or the page at a width under 768 px, or an unexpected redirect |
| `ok` | None of the above |

React development warnings (`Warning: …`) are listed separately under `reactWarnings` and do not change the status. The exception is "Maximum update depth exceeded", which counts as a console error.

### Top-bar collisions

On every page with the shell's top bar (`[data-testid="shell-topbar"]`), `inspectPage` takes each visible top-bar control by its `SHELL_TEST_IDS` value: the menu button, the tenant logo, the Fleet and vessel segments, the switcher chevron, the workspace chip, Apps, Search, the favourite star and menu, Help, the bell and the account button. It records in `page.topbarCollisions`:

- each pair whose boxes intersect horizontally by more than 0.5 px (`shell-vessel-switcher-trigger overlaps shell-search-trigger by 43.9px`);
- each control whose centre point, by `document.elementFromPoint`, lands outside it (`shell-search-trigger centre hits shell-vessel-switcher-trigger`): a neighbour painted over it, or its own middle clipped away, so a tap there reaches the wrong control. This part is skipped while a modal layer is open (a dialog, a menu or the drawer covers the bar on purpose); the overlap part still runs.

A non-empty list grades the capture `fail` at any width, and the terminal summary lists every capture that has one in full after the table (or says there were none). The list is `null` on a page without a top bar, such as `/auth`. Phone widths (under 768 px) run with a touch context, so the coarse-pointer 44 px targets (D-35) are the ones measured; check the top bar on narrow phones with, for example, `--widths 414,390,375,360,320`.

Per capture, `report.json` holds:

- `finalPath`
- `page`: title, first `h1`, theme class, text sample and the detection flags, including `overflowX` and `topbarCollisions`
- `consoleErrors`, `reactWarnings`, `pageErrors`, `failedRequests`
- `externalHosts`: external hosts that were stubbed
- `mock.tablesRead`, `mock.restWithoutFixture`, `mock.rpcWithoutFixture`: what to add to the fixtures to make a page less empty

## The Supabase mock

`lib/supabase-mock.mjs` intercepts the mock origin with `page.route`:

| Path | Answer |
|---|---|
| `/auth/v1/user`, `/token` (refresh and password), `/logout`, `/settings`, `/sessions`, `/factors` | A fake authenticated user built from `fixtures/_auth.json`. The session stays valid for a week, so no refresh is needed. A password sign-in on `/auth` signs the fixture user in |
| `/rest/v1/<table>` | `fixtures/<table>.json` through a small PostgREST look-alike (`lib/postgrest.mjs`), else `[]` |
| `/rest/v1/rpc/<fn>` | `fixtures/rpc/<fn>.json`, else `null` |
| `/storage/v1/**` | Empty lists, signed URLs, and a 1×1 PNG for object downloads |
| `/functions/v1/**` | `200 {}` |
| Realtime websocket | Accepted; joins and heartbeats get empty `ok` replies, so channels settle quietly |

The PostgREST look-alike supports:

- **Selects:** column projection; aliases and casts; embeds by table name, by FK column (`vessels:vessel_id(id, name)`), by `!hint`, plus `!inner`, `...spread` and `(count)`.
- **Filters:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`, `cs`, `cd`, `ov`, the full-text operators, `not.`, and nested `or`/`and` groups.
- **Shaping:** `order` with null placement, `limit`/`offset`/`Range`, exact counts with `Content-Range`, and `HEAD`.
- **Singles:** `.single()` returns a 406 `PGRST116` unless exactly one row matches, the way PostgREST does, so `.maybeSingle()` yields `null`.
- **Writes:** inserts, upserts, updates and deletes are kept in memory for that capture only.

It is forgiving by design:

- Filters on embedded tables are ignored.
- An operator it does not know keeps the row.
- A column the fixture lacks comes back as `null`.

**Session seeding.** Before any app script runs, an init script writes the session to `localStorage` under the key supabase-js derives from the URL: `sb-<first host label>-auth-token`, so `sb-127-auth-token` for the default mock URL. `src/integrations/supabase/client.ts` uses the default key. `previewAuthStorage.ts` falls back to plain `localStorage` off the Lovable preview hosts, which is the case on `127.0.0.1`. The same init script sets `storm-theme` and any `localStorage` values a route asks for.

## Fixtures

```
fixtures/<table>.json     array of rows
fixtures/rpc/<fn>.json    any JSON value
fixtures/_auth.json       the signed-in auth user (id, email, metadata)
fixtures/_config.json     { "missingTables": [...], "missingRpcs": [...] }
fixtures/_personas.json   named variations of all of the above (see "Personas")
```

Tables listed in `missingTables` answer with the PostgREST "table not found" error (`PGRST205`), and functions listed in `missingRpcs` with "function not found" (`PGRST202`). Use them to check that a page for a table or function that is not live yet degrades to its empty or off state (D-01) instead of crashing.

**Relative dates.** A string that is exactly one of these tokens is resolved at load time, so expiry buckets stay meaningful on any day:

| Token | Becomes |
|---|---|
| `"$date:+30"` | 30 days from today (`YYYY-MM-DD`). Units: `d`, `w`, `m`, `y` |
| `"$date:-2m"` | two months ago |
| `"$ts:-3h"` | ISO timestamp 3 hours ago. Units: `m`, `h`, `d` |
| `"$now"` | the current ISO timestamp |

`{year}` inside any string becomes the current year. References follow `TYPE-VSL-YYYY-NNN` (C21), e.g. `INC-DRA-{year}-031`.

**What is seeded:**

- One company: "Demo Fleet".
- Seven vessels: DRAAK, GAME CHANGER, LEVIATHAN, ROCINANTE, XIPHIAS, DAGON and HYDRA. Each has a realistic type, flag, IMO number (valid check digit), MMSI and AIS position.
- The signed-in **Demo Fleet Manager**. The legacy profile role is `dpa`, and the RBAC roles are `superadmin` and `dpa`, fleet-wide, with admin on every module key. That makes `canAccessModule` and the HR, payroll, medical, wellness and legal gates open.
- Twelve crew, named by role ("Demo Master", "Demo Bosun" …), with current assignments.
- Alerts, vessel and crew certificates, incidents, corrective actions, equipment, PMS tasks, defects, spares and documents.
- The dashboard RPCs.
- Phase 2 (pending tables and RPCs, D-01): `account_memberships.json` (the legacy-managed rows the P2 backfill writes, one per profile with a login, so every persona keeps its reach), `user_invitations.json` (one row per invitation status: accepted, send failed, sent, pending legacy, sent but expired, revoked), seven more role-named profiles (imported, invited and disabled crew), `notification_inbox.json` (ten inbox rows across the four severities and the four link scopes, an unregistered record kind and two archived rows), and the RPC answers `record_session_start`, `my_account_status` (both `"active"`; without them the sign-in account check fails closed on every route) and `notification_inbox_mark_all_read`.
- `rpc/has_capability.json` (`true`): the Demo Fleet Manager is a full legacy admin and holds `fleet.operations.vessels.admin`, so the vessel write controls on `/fleet/admin/vessels` and the vessel profile card show (D-224). Without it the RPC answers `null`, which the gate reads as denied (D-04). The `vessel-master` persona answers `false`, so the DRAAK master sees the profile card without Edit.

**Rules (D-07, D-08):**

- No personal data. People are roles, every email is on the reserved `example` domain, and phone, passport and birth-date fields stay `null`.
- No reference-product names or copy.
- These screenshots are of STORM itself. Keep them out of the repo.

`test/harness.test.mjs` checks the identity and no-personal-data rules on the shipped fixtures, and `test/overlays.test.mjs` the same rules on every shipped overlay.

**Adding data for a page:**

1. Run the page.
2. Read `mock.restWithoutFixture` for it in `report.json`.
3. Add `fixtures/<table>.json`, with the columns from `src/integrations/supabase/types.ts` and the status values the module's `constants.ts` uses.

The vessel fixtures have no `code` column, which matches the live database before migration P1. The client derives codes (D-03): DRA, GAM, LEV, ROC, XIP, DAG, HYD.

### Overlays (fixtures.d)

Two streams building at once cannot both edit `profiles.json`, `_personas.json` or `rpc/has_capability.json` (platform-prep PP2). So a stream's additions to shared fixtures live in an **overlay**, `fixtures.d/<overlay>/`, laid out like `fixtures/`. The harness loads the base, then every overlay folder in name order:

| Overlay file | Effect |
|---|---|
| `<table>.json` | Rows are appended; a row with the `id` of a base row replaces it in place; a new table is added |
| `rpc/<fn>.json` | Replaces the base answer |
| `_personas.json` | Personas are added by name |
| `_config.json` | `missingTables` and `missingRpcs` are added to the base lists |

Load errors, each naming both sources: one table's row `id` in two overlays, two overlays answering one RPC, a persona name defined twice (in the base or another overlay). An overlay cannot replace `_auth.json`; other `_*.json` files, folders other than `rpc/` and malformed rows are refused too. Non-JSON files are ignored. The terminal and `report.json` (`overlays`) say which overlays a run used.

- Default folder: `fixtures.d` next to the fixtures folder, so `--fixtures <copy>` reads `<copy>/../fixtures.d`, never the repo's by accident.
- `--overlays DIR`: a folder of overlay folders, or a single overlay folder (one holding `*.json` or `rpc/` itself). Handy for a scratch overlay: `--overlays /tmp/my-overlay`.
- `--no-overlays`: the base only.

Phase 3 wave 1 owners: `fixtures.d/crew/` (X1 Crew) and `fixtures.d/fleet/` (X5 Fleet operations). A stream's *new* tables still get their own `fixtures/<table>.json`. The integrator folds overlays into the base at the wave merge. `fixtures.d/README.md` repeats the rules.

## Routes

`routes.json` is an array of paths or objects:

```json
[
  "/dashboard",
  { "path": "/auth", "slug": "auth", "auth": false, "note": "signed out" },
  { "path": "/vessels", "expectRedirect": "/vessels/dashboard" },
  { "path": "/hris", "expectRedirect": true },
  { "path": "/v/dra/crew", "waitFor": "main h1", "localStorage": { "storm-density": "compact" } }
]
```

| Field | Meaning |
|---|---|
| `auth` | `false` captures the route signed out |
| `expectRedirect` | A path, or `true` for any redirect; without it, a redirect is a warning |
| `waitFor` | A selector to wait for before the screenshot |
| `slug` | Overrides the file name, which is otherwise derived from the path |
| `localStorage` | Values written before any app script runs (`storm-show-roadmap`, `storm-sidebar-collapsed`, …) |
| `actions` | Scripted steps played on the settled page before the screenshot (see "Actions") |
| `persona` | Capture as this persona from `fixtures/_personas.json` (see "Personas") |
| `reducedMotion` | `true` or `false`: sets `prefers-reduced-motion` for this capture (see "Reduced motion") |
| `widths` | Only these of the run's widths, e.g. `[390, 768]` for the navigation drawer, which exists below 1024 px |

New scopes (`/fleet/…`, `/v/:vesselCode/…`) are added here as they land.

### Route files (routes.d)

Besides `routes.json`, every `routes.d/*.json` (an array in the same format) is read, in name order, so each stream adds its captures in a file of its own: `routes.d/crew.json` (X1) and `routes.d/fleet.json` (X5), seeded empty by platform-prep PP2.

- Slugs are unique across all the files; a duplicate is an error naming both files.
- No two entries may capture the same thing: the same path with the same `auth`, `persona`, `actions`, `localStorage`, `widths` and `reducedMotion`. The same path with another persona or other actions is fine (`/v/dra/crew/list` as the master and as a head of department).
- `--list` shows the file each route comes from; `--routes` selects from all of them.

### Actions

A route can open a menu, press a shortcut or type a query before its screenshot:

```json
{ "path": "/fleet/dashboard", "slug": "palette-query", "actions": [
  { "press": "Control+k" },
  { "waitFor": "[data-testid=\"command-palette-input\"]" },
  { "type": { "selector": "[data-testid=\"command-palette-input\"]", "text": "crew" } },
  { "wait": 150 }
] }
```

| Step | Does |
|---|---|
| `{ "click": "<selector>" }` | Clicks the first match |
| `{ "press": "Control+k" }` | Presses a key or chord (Playwright key names: `Escape`, `ArrowDown`, `Shift+Tab`, …) |
| `{ "type": { "selector": "<selector>", "text": "crew" } }` | Focuses the element, then types the text key by key |
| `{ "hover": "<selector>" }` | Moves the pointer over the first match |
| `{ "waitFor": "<selector>" }` | Waits until the selector is visible |
| `{ "wait": 300 }` | Pauses, in milliseconds (0 to 30000) |

- Each step has exactly one key. routes.json is checked when it is read (`lib/options.mjs` → `lib/actions.mjs`): an unknown key or a malformed step stops the run before the server starts, naming the route and the step.
- Steps run in order after the page has settled (network idle, spinners and skeletons gone) and before the screenshot; the page is inspected after them, so the report describes the state on screen.
- A step that fails (selector not found, a timeout of 10 s) never crashes the run. It becomes a note, `action 2 (click [data-testid="…"]) failed: …`, which grades the capture `warn`, and the later steps are skipped.
- Use the `data-testid` values from `src/app/shell/testIds.ts` (`SHELL_TEST_IDS`, `PALETTE_TEST_IDS`) in the form `[data-testid="shell-account-trigger"]`. They are a contract: values never change once shipped. `test/actions.test.mjs` checks that every test id in routes.json exists there.

The shipped interaction captures are `auth-error` (sign-in sent with empty fields: inline errors, S6), `palette-open`, `palette-query` (command palette, S5) and `shell-vessel-switcher-open`, `shell-account-menu-open`, `shell-bell-open`, `shell-apps-open` (top bar, S1). The top bar ones grade `warn` ("action 1 (click …) failed") until the Phase 1 top bar that carries those test ids is in the tree.

### Personas

A persona is a named variation of the fixtures: another signed-in user, other rows, tables or functions that are not live. `fixtures/_personas.json`:

```json
{
  "vessel-master": {
    "note": "what it shows",
    "auth": { "id": "…", "email": "master.11@demo-fleet.example", "user_metadata": { "first_name": "Demo", "last_name": "Master" } },
    "tables": { "user_roles": [ … ] },
    "rpc": { "get_user_roles_full": [ … ] },
    "missingTables": ["…"],
    "missingRpcs": ["…"]
  }
}
```

- Every key is optional; an unknown key is an error. Each capture gets its own copy, so writes never leak.
- A persona's table (or RPC answer) **replaces** the base one of the same name; rows are not merged one by one, so what a persona shows is all in one place. `missingTables` and `missingRpcs` add to `_config.json`'s. `auth` replaces `_auth.json`. Date tokens work as in the other fixtures.
- Choose one per route (`"persona": "vessel-master"`) or for the whole run (`--persona vessel-master`, which wins). A run-wide persona saves `<theme>-<width>-<slug>--<persona>.png`, so it never overwrites the ordinary capture; the report records `persona` per capture.

| Persona | Who / what | Used by |
|---|---|---|
| `vessel-master` | The DRAAK master (legacy role `master`, RBAC `captain`, the role catalogue's vessel master role, on DRAAK only, no fleet-wide role, assigned to DRAAK). No fleet reach (D-26), so no Fleet scope anywhere | `vessel-master-dra` |
| `module-settings` | `vessel_module_settings` rows (pending table, S4): DRAAK `planner` labelled "Leave", DRAAK `charter` labelled "Trip", HYDRA `technical` off | `module-settings-hyd-technical` |
| `rbac-error` | `user_roles` and the two role RPCs (`get_user_roles_full`, `get_user_rbac_permissions`) are not live, so the permissions store ends in its error state (D-56) and the shell offers Retry | any route, with `--persona rbac-error` |
| `account-disabled` | The fleet manager's access is turned off (P3): `record_session_start()` answers `disabled`, so a sign-in ends the session and `/auth` says access is disabled | `auth-disabled` |
| `account-check-error` | The account check answers outside its vocabulary, so the app stays closed and `/auth` offers Retry and Sign out (fail closed, D-04) | `auth-check-failed` |
| `access-not-live` | P3 not applied (D-01): no `user_invitations` table and none of the account RPCs. The sign-in check falls back to the profile; Users & Access shows "Invited" from the profile, never "Sent". Warns by design (the missing table logs 404s) | `users-access-not-live` |
| `inbox-not-live` | P5 not applied (D-01): no `notification_inbox` table and no mark-all-read RPC. The bell falls back to the alerts bell, `/inbox` opens Attention, All and Archived say the inbox is not set up. Warns by design | `shell-bell-open-alerts`, `inbox-not-live`, `inbox-all-not-live` |
| `inbox-empty` | P5 applied, nothing in the inbox yet: the bell and `/inbox` show their empty states | `shell-bell-open-empty`, `inbox-empty` |

Same rules as the base fixtures (D-07, D-08): roles not names, emails on the reserved `example` domain, no phone numbers. `test/actions.test.mjs` checks them.

### Reduced motion

Every capture runs with `prefers-reduced-motion: reduce` by default, so animations never blur a screenshot. A route can set it explicitly with `"reducedMotion": true` (the capture also calls `page.emulateMedia({ reducedMotion: 'reduce' })`), or turn it off with `"reducedMotion": false` to capture the full-motion styles (`no-preference`).

## External requests

Map tiles, CDNs and anything else outside the app and the mock are answered `204` and listed under `externalHosts`. The fleet map therefore shows markers on an empty background.

Google Fonts are fetched by the harness process with `curl`, which uses the machine's proxy settings and CA store, and cached in `.visual/.cache/fonts`. Screenshots use the real Inter, Barlow Semi Condensed and JetBrains Mono even though the browser itself has no route out.

Use `--external live` on a machine with direct internet access to load everything for real.

## Tests

```bash
node --test scripts/visual/test/*.test.mjs
```

(Pass the files: `node --test scripts/visual/test` with a bare directory is not a test file on Node 22.)

CI (`.github/workflows/ci.yml`, job `check`, step "Visual harness unit tests") runs the two suites that need no browser:

```bash
node --test scripts/visual/test/harness.test.mjs scripts/visual/test/postgrest.test.mjs
```

The browser suite, `inspect.browser.test.mjs`, needs Playwright and a browser, so it runs by hand only.

The tests cover:

- the PostgREST look-alike
- the fixture loader, tokens and shipped fixtures
- fixture overlays and route files: merge order, replacement by id, the collision errors, `--overlays` / `--no-overlays`, and the shipped `fixtures.d/` and `routes.d/` (`overlays.test.mjs`)
- options and routes
- scripted actions (validation, order, a failing step as a warning) and personas (`actions.test.mjs`, no browser)
- report grading, including top-bar collisions
- the auth, storage and functions mock
- `inspectPage` in a real browser, including the top-bar collision check on synthetic bars (skipped if Playwright is missing)

They use `node:test` because `vitest.config.ts` only collects `src/**`.
