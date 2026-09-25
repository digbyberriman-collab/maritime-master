# Permission Matrix Standard (PMS v1)

One permission standard for STORM (Maritime Master), Ocean Codes, Ink Fleet and Landlord Ledger. Financial Cockpit is out of scope for now.

- **Capability keys:** `domain.module.subcategory.action`.
- **Sensitivity tiers:** T0 to T3.
- **Scoping:** by department, rank and unit.
- **Bundles:** Access Sets, with per-person overrides.
- **Spreadsheet round-trip** for review and sign-off.

| Path | What it is |
|---|---|
| `MASTER-PROMPT.md` | The build prompt. Paste it into the target repo's Claude Code or Lovable session, followed by that app's addendum. |
| `addenda/<app>.md` | App-specific facts: current state, file paths, legacy mapping, departments, decisions to surface. |
| `catalogues/<app>.json` | DRAFT capability catalogues (compact: action bundles and inherited defaults). Edit these directly. |
| `workbooks/<app>-permission-matrix.xlsx` | Generated DRAFT workbooks for review and mark-up. |
| `../../scripts/permissions/build-matrix-workbooks.mjs` | Validator and workbook generator. It is also the reference implementation of the draft tier rules and SoD resolution. |
| `../../scripts/permissions/check-storm-coverage.mjs` | Checks that every STORM sidebar leaf maps to a catalogue subcategory. |

```bash
node scripts/permissions/build-matrix-workbooks.mjs --check     # validate all catalogues
node scripts/permissions/build-matrix-workbooks.mjs             # regenerate all workbooks
node scripts/permissions/build-matrix-workbooks.mjs storm       # one app
node scripts/permissions/check-storm-coverage.mjs               # STORM nav coverage
```

## Current drafts

| App | Subcategories | Capabilities | T2 | T3 | Departments | Roles |
|---|---:|---:|---:|---:|---:|---:|
| STORM | 314 | 1,431 | 320 | 82 | 17 | 56 |
| Ink Fleet | 222 | 802 | 243 | 57 | 19 | 51 |
| Ocean Codes | 49 | 145 | 57 | 0 | 6 | 21 |
| Landlord Ledger | 32 | 121 | 79 | 15 | 7 | 11 |

## Review workflow

1. **Review the workbook.** Open it and work through the `Dept – *` sheets and `Access Sets`, changing cells with the dropdowns. Record decisions in `Sign-off` and changes in `Change Log`.
2. **Decide the open questions** listed under "Decisions to surface" in each addendum (e.g. whether the Master can *edit* medical).
3. **Build.** Run the master prompt with that app's addendum and your reviewed workbook in the target repo.
