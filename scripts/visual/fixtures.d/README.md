# Fixture overlays

Each folder here is one **overlay**: a stream's additions to the base fixtures in `../fixtures/`, kept in a folder of its own so that a stream never edits a shared fixture file (`profiles.json`, `vessels.json`, `crew_assignments.json`, `_personas.json`, `_config.json`, `rpc/has_capability.json`, …). The harness loads the base fixtures first, then every overlay folder in name order.

```
fixtures.d/<overlay>/<table>.json       rows for that table
fixtures.d/<overlay>/rpc/<fn>.json      the answer for that RPC
fixtures.d/<overlay>/_personas.json     more personas
fixtures.d/<overlay>/_config.json       { "missingTables": [...], "missingRpcs": [...] }
```

| File | Effect on the base |
|---|---|
| `<table>.json` | Rows are appended. A row whose `id` is a base row's replaces that row in place. A table the base does not have is added. |
| `rpc/<fn>.json` | Replaces the base answer. |
| `_personas.json` | Personas are added by name. |
| `_config.json` | The lists are added to the base lists. |

These are load errors, and each names both sources:

- the same row `id` of one table in two overlays;
- two overlays answering one RPC;
- a persona name the base or another overlay already defines.

An overlay cannot replace `_auth.json` (the signed-in fixture user stays the base one). Files that are not JSON, like this README, are ignored. Folder names are lower case letters, digits, dots, dashes and underscores.

Owners in Phase 3 wave 1 (platform-prep plan §2): `crew/` belongs to X1 Crew and `fleet/` to X5 Fleet operations. New tables a stream owns get their own `../fixtures/<table>.json` file; changes to shared tables, shared RPC answers and personas go in the stream's overlay. The integrator folds overlays into the base at the wave merge.

The same rules apply as for the base fixtures (D-07, D-08): people are roles (`first_name` "Demo"), every email is on the reserved `example` domain, and phone, passport and birth-date fields stay `null`. `../test/overlays.test.mjs` checks them on every shipped overlay.

Run with overlays (the default), without them, or with another folder:

```bash
node scripts/visual/capture.mjs --routes /v/dra/crew/list
node scripts/visual/capture.mjs --routes /v/dra/crew/list --no-overlays
node scripts/visual/capture.mjs --routes /v/dra/crew/list --overlays /path/to/overlays
```

`--overlays DIR` names a folder of overlay folders, or a single overlay folder (one that holds fixture files itself). Without it the harness reads `fixtures.d` next to the base fixtures folder, so `--fixtures <copy>` reads `<copy>/../fixtures.d`.
