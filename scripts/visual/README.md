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

# List the routes and their slugs
node scripts/visual/capture.mjs --list
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
| `--routes a,b` | all | Slugs or paths from `routes.json`; an unknown `/path` is captured ad hoc |
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
| `--routes-file`, `--fixtures` | `scripts/visual/…` | Use another routes file or fixtures folder |

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
| `fail` | The ErrorBoundary rendered ("This part of the page failed to render"), the page was blank, the stale-chunk recovery panel showed, an uncaught page error fired, navigation failed, or a signed-in route ended on `/auth` |
| `warn` | Console errors, "Something went wrong" text outside the boundary, an AccessDenied card, a spinner or skeleton (`aria-busy`) that never cleared, a wait that gave up (network never idle, `waitFor` selector not found, screenshot failed), more than 500 mock requests in one capture ("runaway fetching"), horizontal overflow of `main` or the page at a width under 768 px, or an unexpected redirect |
| `ok` | None of the above |

React development warnings (`Warning: …`) are listed separately under `reactWarnings` and do not change the status. The exception is "Maximum update depth exceeded", which counts as a console error.

Per capture, `report.json` holds:

- `finalPath`
- `page`: title, first `h1`, theme class, text sample and the detection flags
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
fixtures/_config.json     { "missingTables": [...] }
```

Tables listed in `missingTables` answer with the PostgREST "table not found" error (`PGRST205`). Use this to check that a page for a table that is not live yet degrades to its empty or off state (D-01) instead of crashing.

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

**Rules (D-07, D-08):**

- No personal data. People are roles, every email is on the reserved `example` domain, and phone, passport and birth-date fields stay `null`.
- No reference-product names or copy.
- These screenshots are of STORM itself. Keep them out of the repo.

`test/harness.test.mjs` checks the identity and no-personal-data rules on the shipped fixtures.

**Adding data for a page:**

1. Run the page.
2. Read `mock.restWithoutFixture` for it in `report.json`.
3. Add `fixtures/<table>.json`, with the columns from `src/integrations/supabase/types.ts` and the status values the module's `constants.ts` uses.

The vessel fixtures have no `code` column, which matches the live database before migration P1. The client derives codes (D-03): DRA, GAM, LEV, ROC, XIP, DAG, HYD.

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

New scopes (`/fleet/…`, `/v/:vesselCode/…`) are added here as they land.

## External requests

Map tiles, CDNs and anything else outside the app and the mock are answered `204` and listed under `externalHosts`. The fleet map therefore shows markers on an empty background.

Google Fonts are fetched by the harness process with `curl`, which uses the machine's proxy settings and CA store, and cached in `.visual/.cache/fonts`. Screenshots use the real Inter, Barlow Semi Condensed and JetBrains Mono even though the browser itself has no route out.

Use `--external live` on a machine with direct internet access to load everything for real.

## Tests

```bash
node --test scripts/visual/test/*.test.mjs
```

CI (`.github/workflows/ci.yml`, job `check`, step "Visual harness unit tests") runs the two suites that need no browser:

```bash
node --test scripts/visual/test/harness.test.mjs scripts/visual/test/postgrest.test.mjs
```

The browser suite, `inspect.browser.test.mjs`, needs Playwright and a browser, so it runs by hand only.

The tests cover:

- the PostgREST look-alike
- the fixture loader, tokens and shipped fixtures
- options and routes
- report grading
- the auth, storage and functions mock
- `inspectPage` in a real browser (skipped if Playwright is missing)

They use `node:test` because `vitest.config.ts` only collects `src/**`.
