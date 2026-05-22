## Tweak `UsersAccessDetailPage` to match screenshot — grouped + expandable Other Modules

Refines the existing detail page (no schema or routing changes).

### Visual tweaks

- "Other Modules" header: subtitle text becomes `None = no access` (matches screenshot wording).
- Module row: lift each row into its own bordered card (white background, rounded-md, subtle border) instead of stacked thin rows, so they match the screenshot's spacing.
- Select trigger shows a colored dot before the label (● green for Read & Write, ● blue for Read Only, ● gray for No Access, ● amber for Admin).
- "Set all to" placeholder = `Choose…`.
- Access Preset dropdown items: show label + muted description on two lines (already implemented; verify rendering matches the screenshot's compact two-line layout).

### Grouped + expandable Other Modules

Replace the flat list with a two-tier structure:

1. **Six top-level grouped rows** (always visible):
   - Safety, Certificates, Technical, Vessel, Charter, Accounting
   - Each group maps to a fixed set of underlying module keys (`lib/moduleGroups.ts`):
     - Safety → `ism`, `erm`, `ptw`, `risk_assessments`, `sops`, `drills`, `incidents`, `investigations`, `capa`, `non_conformities`, `observations`
     - Certificates → `vessel_certificates`
     - Technical → `maintenance`
     - Vessel → `vessels`, `fleet`, `dashboard`
     - Charter → `meetings`, `reports`
     - Accounting → `insurance`, `settings`, `audits_surveys`, `documents`
   - Group-level `Select` value = highest permission across its modules (admin > edit > view > none); when "mixed", show "Mixed" disabled state with subtle warning color.
   - Changing the group-level select applies the chosen permission to every module in the group (batch via existing `useApplyPreset`).

2. **Expand chevron** on the right of each group row toggles a nested list of the underlying modules, each with its own `Select` (existing `ModulePermissionRow` behavior).
   - Expanded rows are slightly indented and use the same per-row card style at a smaller scale.

### Files to change

- `src/modules/users-access/pages/UsersAccessDetailPage.tsx` — replace flat list with grouped renderer; restyle row cards; copy tweaks.
- `src/modules/users-access/lib/moduleGroups.ts` (new) — `OTHER_MODULE_GROUPS` constant + helpers `groupLevelFor(perms, group)` and `applyGroup(group, level)`.
- `src/modules/users-access/components/ModuleGroupRow.tsx` (new) — group row with chevron toggle, select, and expandable child list.

### Out of scope

- No DB / RPC changes.
- List page unchanged.
- No new save semantics — reuses `useSavePermissionOverride` and `useApplyPreset`.
