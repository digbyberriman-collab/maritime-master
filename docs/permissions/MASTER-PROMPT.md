# Master Prompt — Permission Matrix Standard (PMS v1)

> **How to use this prompt (for Digby).** Open a Claude Code session in the target repository, or open the Lovable project. Paste **this whole file**, then paste the matching addendum from `docs/permissions/addenda/`:
>
> | App | Repository | Addendum |
> |---|---|---|
> | STORM / Maritime Master | `maritime-master` | `storm.md` |
> | Ocean Codes | `oceancos-33a83542` | `ocean-codes.md` |
> | Ink Fleet | `inkfleet` | `ink-fleet.md` |
> | Landlord Ledger | `landlord-ledger` | `landlord-ledger.md` |
>
> If you have reviewed and marked up the draft workbook (`docs/permissions/workbooks/<app>-permission-matrix.xlsx`), attach it too, or commit it to the target repo first. Your reviewed values override the draft defaults.
>
> Everything below the line is written to the build agent.

---

## 0. Mission

You are implementing the **Permission Matrix Standard (PMS v1)** in this application. When you finish, the application must have:

1. **One capability catalogue** as the single source of truth. Every screen, feature and sensitive action in the app maps to a capability key of the form `domain.module.subcategory.action`.
2. **Departments and ranks** as first-class, canonical data, used to scope access.
3. **Access Sets**: reusable permission bundles such as Full, HOD, Officer, Crew and app-specific ones. Each person gets one Access Set per vessel (or project, or property) plus individual overrides. When overrides deviate from the set, the UI shows the person as "Custom".
4. **Enforcement everywhere it matters**: UI gating, route gating, edge / server functions and Postgres RLS. Enforcement fails closed.
5. **A Users & Access screen** with List and Matrix views, like the reference screenshot described in §7. Changes are staged and applied through "Review & save".
6. **Spreadsheet round-trip**: export the whole matrix to an `.xlsx` in the exact PMS workbook layout (§8), edit it offline, re-import it, see a diff, and apply it through Review & save.
7. **A safe migration** from today's permission model. No user silently gains or loses access.

Work in the phases in §10. Commit at the end of each phase. Stop and report when a stop condition is hit. Do not skip phases or merge them together.

---

## 1. Inputs

| Input | Where | Notes |
|---|---|---|
| This prompt | — | The standard itself. Apply it literally. |
| App addendum | `docs/permissions/addenda/<app>.md` in `maritime-master` | App-specific facts: current state, file paths, departments, scopes, known gaps, conventions. Where the addendum and this prompt conflict, **the addendum wins on app facts** and **this prompt wins on the standard**. |
| Draft catalogue | `docs/permissions/catalogues/<app>.json` in `maritime-master` | Compact JSON of domains, modules, subcategories, actions, tiers, owners, departments, roles, access sets and SoD rules. It is a starting point, not gospel: Phase 0 reconciles it against the real code. |
| Generator | `scripts/permissions/build-matrix-workbooks.mjs` in `maritime-master` | The reference implementation of the tier rules (§3.7), the SoD resolution and the workbook layout (§8). Port its logic; don't reinvent it. |
| Reviewed workbook (optional) | Attached, or committed to this repo | If present, its `Dept – *` and `Access Sets` cell values are the approved defaults and replace the rule-generated ones. |

`maritime-master` is public, so you can fetch raw files directly:
`https://raw.githubusercontent.com/digbyberriman-collab/maritime-master/<branch>/docs/permissions/...`
Use `main` once this work is merged, otherwise the branch `claude/gracious-volta-g42f6s`. Copy the catalogue JSON and the generator into this repo, under `docs/permissions/` and `scripts/permissions/`, so the repo is self-contained.

---

## 2. Non-negotiables

1. **Additive migrations only.** Never drop or rewrite an existing permission table, enum or policy until the replacement is live, tested and the migration diff (§9) has been approved. Keep the old paths working in parallel during the transition.
2. **Fail closed.** While permissions are loading, or when a key is unknown, a user has no access. The only exception is the user's own record (`view_own`).
3. **No silent access changes.** Every user's effective access before and after migration is diffed and reported. Any change must be explicitly listed and approved.
4. **T3 (special-category) data is never granted implicitly.** Only the owning department, named `t3Holders` or an explicit override with a recorded reason can reach it. Examples: medical, disciplinary, bank details, legal privilege, identity documents.
5. **Every grant change is audited.** Record who, what, from, to, reason, when, and the source (UI, import or migration).
6. **Nobody grants access to themselves.** An import cannot be applied by the person who uploaded it (four-eyes rule), unless the addendum explicitly allows a sole-owner exception.
7. **Follow the repo's own conventions**: migration tooling (Supabase SQL / Drizzle), lint, typecheck, tests, lint ratchets and branch rules. These are listed in the addendum. Never force-push. Lovable-synced `main` branches must stay deployable.
8. **Never weaken RLS to make UI work.** If the UI needs data the user can't see, the UI is wrong.
9. **Do not invent product scope.** If a nav item has no real page, still catalogue it (so the matrix is complete), but mark it `notes: "placeholder"`. Don't build the page.

---

## 3. The standard

### 3.1 Taxonomy and keys

```
App → Domain → Module → Subcategory → Capability
                                       └─ key = domain.module.subcategory.action
```

- **Domain**: a top-level navigation area, e.g. `vessel`, `hris`, `project`, `property`.
- **Module**: a nav group inside the domain, e.g. `vessel.safety`, `hris.performance`.
- **Subcategory**: one page, tab or feature, e.g. `vessel.safety.permit_to_work`.
- **Capability**: one action on one subcategory, e.g. `vessel.safety.permit_to_work.approve`.
- **Key format**: exactly four dot-separated, snake_case segments matching `^[a-z0-9_]+(\.[a-z0-9_]+){3}$`.
- **Key stability**: keys never change once shipped. To rename, add the new key, alias the old one and deprecate it.
- **Legacy keys**: an existing permission string (e.g. `crew.view_medical`, `budget.view`, `job.accept`) is kept as a `legacy_key` alias on exactly one capability. Code that still calls the old key must resolve through the alias.
- **Cross-links**: a nav leaf that links to another module's page (a `crossLink`) does not get its own subcategory. It inherits the target page's capability and is listed in that subcategory's `navLabels`.

### 3.2 Action vocabulary

This vocabulary is fixed. Do not add verbs; use `labels` to give an action a domain-specific display name.

| Action | Meaning | Example label |
|---|---|---|
| `view_own` | See your **own** record only (self-serve) | "View own payslips" |
| `view` | Read records within scope | "See crew list" |
| `create` | Create / submit / raise | "Submit hours of rest", "Run payroll" |
| `edit` | Modify | "Edit profiles" |
| `delete` | Delete / cancel / archive | "Cancel a job" |
| `export` | Export / download / print | — |
| `assign` | Route, assign, transfer or triage | "Transfer crew", "Assign contractor" |
| `approve` | First-line approval (HOD, budget owner, one approval-chain stage) | "Approve training (HOD)" |
| `final_approve` | Second-line or final approval (Master, DPA, budget holder, works acceptance) | "Final training approval" |
| `sign` | Attestation: sign an entry, acknowledge, complete a checklist, countersign | "Sign log entry" |
| `settle` | Record a payment / mark paid | "Mark expenses paid" |
| `admin` | Configure the subcategory: templates, settings, lists | "Manage checklists" |

Each subcategory declares only the actions that genuinely apply to it.

### 3.3 Sensitivity tiers

| Tier | Name | Examples | Rules |
|---|---|---|---|
| T0 | Internal | Dashboards, vessel details, weather | Anyone authenticated in scope |
| T1 | Operational | Checklists, drills, maintenance, HoR, leave | Department / vessel scoped |
| T2 | Confidential | Employment, compensation, invoices, budgets, guest and tenant PII, commercial terms | Grant needs a reason; audited; column-level care in exports |
| T3 | Special category | Medical, disciplinary, bank details, legal privilege, ID / screening docs, personal finance | Only the owning department, named `t3Holders` or an explicit override **with a reason**. Never granted through a preset alone. Shown with the orange sensitive styling. Every read is logged when the addendum says so. |

A capability's tier defaults to its subcategory's tier. It can be overridden per action through `actionTiers`: for example "raise a legal request" is T1, while reading legal matters is T3.

### 3.4 Scopes

Every grant carries a **scope code**. Scope codes are app-specific and listed in the addendum and the catalogue's `scopes` array. They are ordered from narrowest to widest:

| App | Codes (narrow → wide) |
|---|---|
| STORM / Ink Fleet | `S` self · `D` department · `V` vessel · `F` fleet |
| Ocean Codes | `S` self · `D` department · `C` company · `P` project · `V` vessel · `G` global |
| Landlord Ledger | `S` self · `P` property · `E` entity · `A` account |

Every app maps four abstract levels to codes (`levels`): `self`, `group`, `unit` and `all`. A single role may remap a level through `levelCodes`. For example, a contractor's `group` is their own company, `C`.

`—` means no access. The **effective scope** of a capability for a user is the **widest** scope across their Access Set grant and any grant overrides.

**Scope predicates.** Implement each scope as a SQL predicate:

- **self**: the record's subject or owner is `auth.uid()`.
- **department**: the record's department is one of the user's departments **on that vessel** (or project or property).
- **vessel / project / property / entity**: the record's unit is one the user is assigned to.
- **fleet / global / account**: the record belongs to the user's company or account.

Every T1–T3 table must carry the columns these predicates need: `vessel_id` / `project_id` / `property_id`, `department`, and `subject_user_id`. Add them where missing, backfilled and indexed.

### 3.5 Departments, ranks and role tiers

- **One canonical `departments` table**, per app (and per vessel if the app needs vessel-specific departments), mirrored by one TS constant generated from it. **Delete every other hard-coded department list** and import the canonical one. The addendum lists the duplicates to remove.
- **One `ranks` / `rank_department_map` table.** Each rank belongs to one department and has one **role tier**:

| Tier | Typical ranks | Default reach |
|---|---|---|
| `command` | Master, DPA, Fleet Manager, Owner, Project Manager | unit (all for shore / global roles) |
| `hod` | Chief Officer, Chief Engineer, Chief Stew, Head Chef, Doctor, HR Manager | group (own department) |
| `officer` | 2/O, 2/E, Bosun, Sous Chef, Medic | group |
| `rating` | AB, Deckhand, Motorman, Steward, Contractor, Tenant | group |
| `trainee` | Cadets, OS, day workers | self |
| `external` | Flag / class surveyors, auditors, viewers (time-bounded) | unit |
| `admin` | System administrator: configures, does not operate | all |

- A role may override its reach with `reach`, e.g. a Purser is `hod` with vessel-wide reach.
- Free-text rank or position fields stay for display but must be mapped to a canonical rank. Unmapped ranks appear in the Phase 0 gap report.
- Each subcategory declares `owners` (department keys). **Ownership drives HOD and officer scoping**: a department's HOD gets full operational access to owned areas; other HODs get view and first-line approval only where flagged.

### 3.6 Access Sets and presets

- `access_sets(key, label, description, tier, reach, is_system, company_id)`. System sets come from the catalogue's `accessSets` array.
- `access_set_grants(access_set_id, capability_key, scope_code)`. The explicit grant list is materialised from the tier rules (§3.7), or from the reviewed workbook when there is one.
- `user_access_assignments(user_id, unit_id /*vessel|project|property*/, department, rank, access_set_id, valid_from, valid_until)`.
- `user_permission_overrides(user_id, unit_id, capability_key, effect /*grant|deny*/, scope_code, reason, valid_from, valid_until, created_by)`. Reuse or extend the existing overrides table if the app has one.
- **Preset chip:** show the Access Set label. If the person has any active override, show **Custom** and explain the deviation on hover. Put this logic in one function, e.g. `derivePreset()`.
- A person can have different Access Sets on different vessels or projects.

### 3.7 Draft default rules (tier rules)

These rules generate the draft role and Access Set defaults. They are implemented in `ruleValue()` in the generator; port that function exactly, including its comments, into `src/lib/permissions/rules.ts`. Summary, for role *r* in department *d*, subcategory *s* and action *a*:

1. **Explicit grants** in the catalogue (`grants`) win.
   - Array form: an exclusive list of roles, each at the role's reach.
   - Object form: overrides only the listed roles; everyone else falls through to the rules below.
2. `onlyRoles` restricts the subcategory to the listed roles.
3. `view_own` gives `S` to everyone except external roles. If `selfRoles` is set, only those roles get it.
4. **T3**: if *r* is in `t3Holders`, it gets exactly the listed actions. Otherwise *r* gets nothing unless its department owns *s*.
5. `ownerOnly` subcategories are invisible to other departments except `command`.
6. **Per tier**:
   - **admin**: operates owned areas; elsewhere only `admin` actions and T0/T1 `view`.
   - **command**: everything at its reach, subject to the T3 rule above.
   - **hod**:
     - Owned areas: everything except `final_approve`. Scope is the whole vessel/unit, or its own department when `deptScoped`.
     - Other areas: `view` on T0 → unit, T1 → department (if `deptScoped`) else unit, T2 → department only if `hodVisible`.
     - Other areas, flagged only: `approve` if `hodApproves`, `create`/`edit` if `hodEdits`, `admin` if `hodAdmin`.
   - **officer**: owned areas — `view` unit; `create`/`edit`/`export`/`sign` group; `approve` only if `officerApproves`. Other areas: T0/T1 `view`.
   - **rating**: owned areas — `view` group; `create`/`edit` only if `ratingEdits`. Other areas: T0 `view`; T1 `view` only if `crewVisible`.
   - **trainee**: T0 `view`, plus `crewVisible` T1.
   - **external**: `view` (and `export` if `auditExport`) on `auditVisible` subcategories only, never T3.
7. **Shared rules for all tiers**:
   - `crewCreates: self|group`: anyone may raise one for themselves or their department (HoR, leave, incidents).
   - `crewSigns`: anyone may sign or acknowledge their own item.
   - For roles with fleet or global reach, "own department" grants outside owned areas collapse to **none**, not to fleet. A shore finance officer does not see every vessel department's crew profiles.
8. **Dependency**: any grant on a subcategory implies at least that reach of `view`.
9. **Role-level SoD** (§3.8) resolves conflicting pairs. The approver side is kept by `approverTiers` (default `command`); everyone else keeps the executor side.

The rules only produce **drafts**. The approved truth is whatever ends up in `access_set_grants` after sign-off.

### 3.8 Rules engine

**Effective access resolution.** Implement this identically in SQL (`has_capability`) and TS (`can()`):

```
has_capability(user, key, ctx{unit_id, department, subject_user_id, record_owner_id}):
  cap := catalogue[key]                      -- unknown key → FALSE (log it)
  if cap.entitlement and not has_entitlement(user.account, cap.entitlement) → FALSE
  if cap.action = 'view_own' → RETURN ctx.subject_user_id = user OR ctx.record_owner_id = user
  -- denies first
  if exists active override(user, key, effect='deny', unit matches ctx.unit_id) → FALSE
  grants := access_set_grants for user's active assignments on ctx.unit_id
          ∪ active override grants (effect='grant') on ctx.unit_id or unit_id IS NULL
  if grants empty → FALSE
  scope := widest(grants.scope_code)
  RETURN scope_predicate(scope, user, ctx)   -- §3.4
```

- **"Active"** means `valid_from <= now() < coalesce(valid_until, 'infinity')`.
- **Global roles:** unit-less assignments and overrides (`unit_id IS NULL`) apply to every unit in the company or account.
- **Dependencies:** enforced when a grant is saved. Saving a grant for `edit` / `approve` / `final_approve` / `sign` / `settle` / `assign` / `admin` without `view` is auto-corrected, and the correction is shown in Review & save. T3 `edit` requires T3 `view`.
- **Separation of duties:**
  - **`level: role`** rules are checked when a grant is saved. The same person cannot hold both A and B unless an override records an explicit, reasoned exception.
  - **`level: record`** rules are checked in the action handler (server-side and RLS `WITH CHECK`). The same person cannot do A and B on the same record: approve their own HoR, give final approval on a training record they approved as HOD, countersign their own log entry, apply an import they uploaded.
- **Self-serve:** `view_own` is always available on a person's own records where the subcategory declares it. MLC requires it for hours of rest, employment agreements and medical records.
- **Time-bounded access:** external, relief and auditor assignments **must** have `valid_until`. The UI warns 14 days before expiry.

---

## 4. Data model

Adapt names to the app's conventions and extend existing tables where the addendum says so. Everything is additive.

```sql
-- Catalogue (seeded from src/lib/permissions/catalogue.ts via generated migration)
create table permission_catalogue (
  key text primary key check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+){3}$'),
  domain text not null, module text not null, subcategory text not null,
  action text not null check (action in ('view_own','view','create','edit','delete','export','assign','approve','final_approve','sign','settle','admin')),
  label text not null, sensitivity text not null check (sensitivity in ('T0','T1','T2','T3')),
  owner_departments text[] not null default '{}', department_scoped boolean not null default false,
  route text, entitlement text, legacy_key text unique, aligns_with text,
  sort_order int not null, is_active boolean not null default true
);
-- STORM: extend the existing public.modules table with these columns instead,
-- so user_permission_overrides.module_key FK keeps working (see addendum).

create table departments (key text primary key, label text not null, sort_order int, is_active boolean default true);
create table ranks (key text primary key, label text not null, department_key text references departments, tier text not null, default_access_set text);
create table access_sets (id uuid primary key default gen_random_uuid(), key text unique, label text not null, description text, tier text, reach text, is_system boolean default false, company_id uuid);
create table access_set_grants (access_set_id uuid references access_sets on delete cascade, capability_key text references permission_catalogue, scope_code text not null, primary key (access_set_id, capability_key));
create table user_access_assignments (id uuid primary key default gen_random_uuid(), user_id uuid not null, unit_id uuid, department text references departments, rank text references ranks, access_set_id uuid references access_sets, valid_from timestamptz default now(), valid_until timestamptz, created_by uuid, created_at timestamptz default now());
-- user_permission_overrides: extend existing, or create with effect grant|deny, scope_code, reason (NOT NULL for T2/T3), valid_from/valid_until.
create table permission_matrix_imports (id uuid primary key default gen_random_uuid(), uploaded_by uuid not null, file_path text not null, status text check (status in ('parsed','invalid','staged','applied','rejected')), diff jsonb, errors jsonb, applied_by uuid, applied_at timestamptz, created_at timestamptz default now(), check (applied_by is distinct from uploaded_by));
-- permission_audit_log: reuse the existing one if present; add source ('ui'|'import'|'migration'), reason, capability_key, scope_from, scope_to.
```

**Functions** (`SECURITY DEFINER`, `STABLE`, `search_path = public`):

- `has_capability(_user uuid, _key text, _unit uuid default null, _department text default null, _subject uuid default null) returns boolean`
- `get_effective_capabilities(_user uuid, _unit uuid default null) returns table(capability_key text, scope_code text, source text)`: one round-trip for the frontend.
- `capability_scope(_user uuid, _key text, _unit uuid) returns text`: the widest scope code or null. Use it in RLS predicates.

**RLS pattern** for a department-scoped T2 table:

```sql
create policy "pms_select" on hr_contracts for select to authenticated using (
  has_capability(auth.uid(), 'hris.employee_records.contracts_employment.view', vessel_id, department, subject_user_id)
  or (subject_user_id = auth.uid() and has_capability(auth.uid(), 'hris.employee_records.contracts_employment.view_own', vessel_id))
);
```

- Start with **T3 and T2 tables**, then T1.
- Keep existing policies in place, OR-ed in, until the migration diff is signed off. Then remove them in a separate, clearly labelled migration.
- Seed data is **generated** from the catalogue by a script (`scripts/permissions/generate-seed.mjs`) into a normal migration file. Never hand-edit the seed.

---

## 5. Code: single source of truth

- **`src/lib/permissions/catalogue.ts`**: the catalogue as typed data, converted from the JSON. It also exports:
  - `CapabilityKey`, a string-literal union generated from the catalogue, so `useCan('typo.key')` fails typecheck;
  - `CATALOGUE`, `DEPARTMENTS`, `RANKS`, `ACCESS_SETS` and `SOD_RULES`.
- **`src/lib/permissions/rules.ts`**: `ruleValue`, `computeDefaults` and `resolveSoD`, ported from the generator.
- **`src/lib/permissions/can.ts`**: the TS mirror of `has_capability`, working from `get_effective_capabilities` data.
- **`src/lib/permissions/workbook.ts`**: xlsx export and import (§8), sharing layout code with the generator.
- **Tests** (Vitest):
  - **coverage**: every nav leaf and every route has a `view` or `view_own` capability, matched on label or `navLabels`. Port `scripts/permissions/check-storm-coverage.mjs` to the app's nav config.
  - **catalogue ↔ DB seed parity**.
  - **no unknown keys**: grep for `useCan(` / `can(` / `has_capability(` string literals.
  - **rules**: snapshot `computeDefaults` for five representative roles.
  - **SoD**: role-level conflicts are rejected at save; record-level conflicts are rejected in handlers.
  - **workbook round-trip**: export → import → zero diff.
  - **RLS matrix**: for each T2/T3 table, each Access Set, and allowed vs denied rows. Extend the app's existing RLS test harness if it has one.

---

## 6. Enforcement

| Layer | Implementation | Rule |
|---|---|---|
| Frontend state | A permissions store loads `get_effective_capabilities` once per session and per unit switch | While loading: `can()` returns false (fail closed), except `view_own` on the user's own record |
| Components | `useCan(key, ctx?)` and `<Can key ctx fallback>` | Hide actions the user can't perform; show a disabled state with a tooltip only where discoverability matters |
| Routes / nav | Each nav leaf gets a `capability` field (replacing ad-hoc `moduleKey` / `requireRole` / boolean flags). The route guard checks `view` or `view_own`. | Hide nav items the user cannot open; deep links render a 403 page, never a blank one |
| Edge / server functions | `assertCapability(req, key, ctx)`, which calls `has_capability` with the caller's JWT | Replace every hard-coded role list (`if role in [...]`) |
| Database | RLS with `has_capability` / `capability_scope` | The only enforcement that actually protects data. UI gating is a convenience. |
| Record-level SoD | Server-side check plus RLS `WITH CHECK` | e.g. `approved_by <> submitted_by` |
| Audit | Every grant change → `permission_audit_log`; every T3 read → `sensitive_access_log` (if the addendum requires it) | Reason required for T2/T3 |

Remove the old boolean role flags (`isAdmin`, `isHr` …) **only after** every usage has moved to `useCan`. Until then, derive them from capabilities so there is one truth.

---

## 7. UI: Users & Access

Match the reference screenshot and the app's existing design system. All apps are dark-mode-first; use the app's tokens (Abyss / Deep / Slate / Drift / Signal where defined).

- **Tabs**:
  - **Vessel Crew** (or People / Team / Members, per the addendum): per-unit people with their Access Sets.
  - **Account Admins**: company-level admins and global roles.
  - **Access Sets**: create, clone and edit sets, with the same matrix editor.
- **Toolbar**:
  - "Find crew" search across the whole company.
  - Unit selector (vessel, project or property).
  - List / Matrix toggle.
  - Sort by Rank (canonical rank order) or Name.
  - Filter chips with live counts: All · Custom only · holders of any chosen capability (e.g. "Can view medical", "Can access employment", "Payroll access") · expiring in 14 days.
- **List view**: one row per person, showing name, rank, department, preset chip, per-domain summary chips (none / read / read-write) and "Edit". Checkbox multi-select allows bulk-assigning an Access Set.
- **Matrix view**:
  - **Rows**: people, grouped by department and then rank.
  - **Columns**: capabilities for the module picked in the column picker (Domain › Module). There are too many capabilities for one grid, so offer a "Key capabilities" view as the default, with the screenshot's 17 columns defined in the addendum. Group headers show Domain › Module › Subcategory.
  - **Styling**: sensitive (T2/T3) column headers are orange.
  - **Cells**: a checkbox for binary scope, or a scope dropdown (`— S D V F`) where the subcategory supports several scopes.
  - Clicking a cell **stages** a change. Nothing saves until **Review & save**.
- **Review & save dialog**: a diff grouped by person, showing capability, from → to and scope.
  - Auto-applied dependency corrections are shown.
  - SoD violations block the save and are explained.
  - T2/T3 changes require a reason, with an optional `valid_until`.
  - Applying writes overrides or Access Set grants and the audit log in one transaction.
- **Person detail**:
  - Access Set per unit and department scope.
  - Overrides, with reason and expiry.
  - Effective-permissions inspector (why a capability is granted or denied: set, override or deny).
  - Audit history.
- **Export / Import buttons** on the Users & Access page (§8), gated by `admin.access.users_access.export` and `...permission_matrix_import.create` (key names per the catalogue).

---

## 8. Spreadsheet export / import

The workbook layout is **identical across apps** and identical to `scripts/permissions/build-matrix-workbooks.mjs`. The in-app export writes the same sheets; the import reads them back.

| Sheet | Content |
|---|---|
| `README` | App, PMS version, generated timestamp, status, coverage stats, legend (scopes, tiers, actions), rules |
| `Catalogue` | One row per capability, in Excel outline groups Domain (L0) › Module (L1) › Subcategory (L2) › Capability (L3). Columns: Key · Capability · Tier · Action · Domain · Module · Subcategory · Owner depts · Dept-scoped · Route · Enforcement · Requires module · Legacy key · Aligns with · Notes. Autofilter on. |
| `Access Sets` | Capability rows (same grouping) × two columns per set: *Own dept area* and *Other areas* |
| `Dept – <Name>` (one per department) | Capability rows (same grouping) × one column per rank/role in that department. Row 2 shows each role's tier, reach and legacy app role. |
| `Separation of Duties` | Rule, A, B, level, description, draft resolution |
| `People` | **Long format**: Person · Email · Unit · Department · Rank · Access set · Capability key · Value · Source (set/override) · Reason · Valid until. One row per effective grant. |
| `Sign-off` | Department / area · Reviewer · Role · Decision (dropdown) · Date · Notes |
| `Change Log` | Date · Version · Sheet · Key · Role/set/person · From · To · Changed by · Reason |

**Cell vocabulary**: `—` (also accept `-` and blank) or one of the app's scope codes. Enforce it with Excel data validation (dropdown) and colour it with conditional formatting (wider scope = stronger Signal tint). Tier cells: T2 amber, T3 orange with bold text. Freeze panes at `D4` on matrix sheets.

**Import pipeline:**

1. Upload.
2. Parse, collecting an error list of: unknown sheet or key, invalid value, T3 granted to a non-owning department without a reason column, and role-level SoD violations.
3. Diff against live `access_set_grants` (Access Sets sheet), rank defaults (Dept sheets) and overrides (People sheet).
4. Store the result in `permission_matrix_imports.diff`, status `staged`.
5. A **different** user with `...permission_matrix_import.approve` opens Review & save and applies it.

Also:

- **Idempotent**: re-importing an applied file produces an empty diff.
- **Large exports**: they are generated server-side or in a Web Worker so the UI never blocks. STORM's catalogue alone is about 1,400 capabilities × 17 departments.

---

## 9. Migration of existing grants

1. **Snapshot** the effective access of every user under the **current** model, using the current code paths (role checks, overrides, flags, per-module tiers). Store it as `migration/pms-before.json`, or in a table.
2. **Map** the current model to PMS:
   - legacy keys → capabilities, via `legacy_key`;
   - roles → rank + Access Set;
   - per-user extras → overrides.
   The addendum gives the specific mapping.
3. **Compute** effective access under PMS and store it as `pms-after`.
4. **Diff** and write a report, `docs/permissions/migration-report-<date>.md`, containing:
   - totals;
   - a per-user table of gained and lost capabilities (key, scope from → to);
   - a per-capability table of gainers and losers;
   - T3 changes listed first and highlighted.
5. **Stop** and present the report. Apply only after approval. If the user has pre-approved, apply zero-diff migrations automatically; everything else waits.
6. **Keep legacy enforcement** OR-ed in (UI and RLS) until one release after the migration, then remove it in a labelled migration.

---

## 10. Phases

Commit at the end of every phase with a message like `pms: phase N — <summary>`. Run the repo's own lint, typecheck and tests before every commit.

| Phase | Deliverable | Stop and report if… |
|---|---|---|
| **0. Discover & reconcile** | `docs/permissions/gap-report.md`: every route / nav leaf / edge function / table with its current gate, every role/flag/tier in use, every duplicated department or rank list, and every catalogue subcategory with no real page (and vice versa). Update the catalogue JSON to match reality. | A real page has no sensible home in the taxonomy, or the addendum's facts are wrong |
| **1. Catalogue** | `src/lib/permissions/catalogue.ts` + generated key type + coverage test passing; workbook regenerated from the reconciled catalogue | Coverage cannot reach 100% without inventing scope |
| **2. Schema & SQL** | Additive migrations: tables, generated seed, `has_capability` / `get_effective_capabilities` / `capability_scope`, audit extensions; SQL unit tests | A required column (`department`, `subject_user_id`, unit) cannot be backfilled reliably |
| **3. Enforcement** | `can()` / `useCan` / `<Can>` / route guard / `assertCapability`; RLS on T3 then T2 tables (OR-ed with legacy); fail-closed loading; hard-coded role lists replaced | Any RLS change would lock out a current legitimate workflow |
| **4. UI** | Users & Access tabs, List/Matrix, filters, preset chips, staged edits, Review & save, person detail, Access Sets editor | — |
| **5. Spreadsheet** | Export (all sheets) + import pipeline + round-trip test | — |
| **6. Migration** | Before/after snapshot, diff report | **Always stop here** with the report unless the diff is empty |
| **7. Acceptance** | All §11 checks green, then `docs/permissions/IMPLEMENTATION-NOTES.md` covering what was built, what was deferred, and any follow-ups | — |

---

## 11. Acceptance criteria

- [ ] 100% of nav leaves and routes map to a capability (coverage test green).
- [ ] Catalogue, DB seed and generated TS type are in parity (test green).
- [ ] No string literal passed to `useCan` / `can` / `assertCapability` / `has_capability` is missing from the catalogue (test green).
- [ ] RLS tests: every T3 and T2 table is denied to a default Crew/Rating set and to an HOD of a non-owning department, and allowed to the owning department and named holders.
- [ ] Record-level SoD enforced server-side (tests). Role-level SoD blocks the save (tests).
- [ ] Permissions load fails closed (test).
- [ ] Workbook export → import round-trip gives zero diff (test). The exported workbook opens in Excel with dropdowns, colours, outline groups and frozen panes.
- [ ] Every grant change appears in the audit log with source and reason.
- [ ] Migration report produced; diff approved or empty.
- [ ] The repo's lint, typecheck, test and build all pass, and the lint ratchet has not regressed.
- [ ] No hard-coded role lists remain in edge / server functions (grep in the report).
- [ ] Only one department list and one rank list remain in the codebase (grep in the report).

---

## 12. Final report

End with a short report containing:

1. What shipped, per phase.
2. Coverage numbers (domains / modules / subcategories / capabilities, T2/T3 counts).
3. The migration diff summary, with a link to the report.
4. Anything deferred and why.
5. Decisions that need the owner's input (e.g. the "Master can edit medical?" question flagged in the catalogue notes).

Keep it factual. If something failed or was skipped, say so plainly.

---

### Appendix A: compliance anchors (maritime apps)

- **MLC 2006**
  - Reg. 2.3 / Standard A2.3: hours of rest. Records are signed by the seafarer and the Master; seafarers receive a copy → `view_own`, `sign`, `approve` / `final_approve`.
  - Reg. 4.1: medical care. Medical information is confidential and used only to assess and treat → T3, owning department = Medical.
  - Standard A2.1: seafarers' employment agreements. The seafarer must have access → `view_own` on employment records.
- **ISM Code**: 4 (DPA access to all SMS records → the DPA holds `command` with fleet reach), 10 (maintenance records), 12 (internal audits → external / auditor time-bounded sets).
- **STCW A-VIII/1**: rest-hour records available for inspection → `auditVisible` + `auditExport` on HoR.
- **UK GDPR / GDPR Art. 9**: special-category data → T3 with purpose limitation and access logging. **Art. 5(1)(c)**: data minimisation → department scoping by default.

### Appendix B: glossary

- **Access Set**: a named bundle of capability grants. The screenshot calls these presets (Full / HOD / View / Custom).
- **Custom**: shown when a person's overrides deviate from their Access Set.
- **Owning department**: the department(s) whose HOD runs a subcategory day-to-day.
- **Reach**: the widest scope a role's tier normally gets.
- **Scope code**: how far a grant extends (self → department → unit → all).
