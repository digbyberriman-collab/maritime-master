## Users & Access — list + member detail (wired to RBAC)

Builds the two pages from the screenshots and wires them to the existing RBAC tables (`rbac_user_roles`, `roles`, `role_permissions`, `user_permission_overrides`, `modules`, `profiles`).

The existing `/admin/users` (mock UserManagement) stays untouched. We add a new route group under `/users-access` so the screenshots' design ships cleanly without disturbing legacy code.

### Routes

- `/users-access` — list page (default for the "Users & Access" sub-nav item)
- `/users-access/:userId` — member detail page
- Update `FleetSubNav` item from `/settings/users` → `/users-access`

Both wrapped in `ProtectedRoute`. Access gated to roles with `settings.admin` (DPA / Superadmin / Fleet Manager) — non-admins get redirected to `/dashboard`.

### Page 1 — `UsersAccessListPage`

Layout matches screenshot 1 (rows of crew with badges + module chips + Edit button on the right).

Data:
- Source: `profiles` joined to `crew_assignments` (current) + `rbac_user_roles` + `roles` (one row per user, scoped to `current_user_company_id()`).
- For each user, derive the **preset badge** from their highest role:
  - `View Only` (gray) — only `view` perms across modules
  - `Department Head` (green) — has `edit`/`admin` on department-scoped modules
  - `Full Access` (green-solid) — has `admin` on HR + Medical
  - `Custom` (amber) — mixed / per-module overrides exist
- Module chips read from `get_user_permissions_full(p_user_id)` aggregated into 6 fixed groups: **Safety, Certs, Tech, Vessel, Charter, Acct** — render `R/W` (green) or `RO` (blue) or hide if no access.

Row UI:
- Avatar circle + name + `active` status pill
- Position (from `crew_assignments.position`)
- Preset badge (color per above)
- Module chips row (only ones with access)
- `Login as` (only for Superadmin viewer, only for non-self rows) + `Edit` button → `/users-access/:userId`

Top of page:
- Title "Users & Access"
- Search input (filters by name/position client-side)
- Filters: status (active/inactive), preset, vessel (uses existing multi-vessel store)
- "Add User" button (opens existing `AddUserModal`)

### Page 2 — `UsersAccessDetailPage`

Layout matches screenshot 2 (vessel selector at top, Back link, name + role badges, Crew Module Access card, Other Modules card with per-module R/W selects).

Sections:

1. **Header card** — name, `active` chip, role chip (from `roles.display_name`)
2. **Crew Module Access** card
   - Single `Select` "Access Preset" with options:
     - View Only — "Can see crew list only"
     - Department Head — "Manage crew, approve leave and hours of rest, …"
     - Full Access — "Full access including medical records, employment, and all approvals"
     - Custom — "Configure individual permissions manually" (auto-set when user diverges)
   - Selecting a preset writes a batch of `user_permission_overrides` rows for crew-related modules (`crew`, `hr`, `crew_certificates`, `hours_of_rest`, `medical`) at the matching permission level.
3. **Other Modules** card
   - Header: "None = no access" + "Set all to:" `Select` (No Access / Read Only / Read & Write / Admin) applies to all rows.
   - One row per module from `modules` table (excluding the crew-cluster handled above):
     - Module name on the left
     - `Select` on the right with options: `No Access` (gray), `Read Only` (blue), `Read & Write` (green), `Admin` (purple)
   - Selecting writes/updates a `user_permission_overrides` row for `(user_id, module_key, permission)` and invalidates cache.

Save behavior:
- Each select change debounces 400ms then upserts via `user_permission_overrides` (`is_granted=true`, scope inherited from role, `granted_by=auth.uid()`).
- Toast on success/failure.
- After every write, call `log_permission_change(...)` for audit trail.

### Hooks / files to add

```
src/modules/users-access/
  pages/
    UsersAccessListPage.tsx
    UsersAccessDetailPage.tsx
  components/
    UserRow.tsx              // one list row
    PresetBadge.tsx          // colored preset chip
    ModulePermChip.tsx       // R/W or RO chip
    AccessPresetSelect.tsx   // Crew Module Access dropdown
    ModulePermissionRow.tsx  // module name + R/W select
  hooks/
    useUsersWithAccess.ts    // list query
    useUserAccessDetail.ts   // detail query (perms + role)
    useSavePermissionOverride.ts  // mutation
    useApplyPreset.ts        // batch mutation for presets
  lib/
    presets.ts               // preset → module/permission matrix
    derivePreset.ts          // infer preset from current perms
```

### Wiring

- `src/routes/index.tsx`: add the two routes (lazy-loaded).
- `src/modules/dashboard/components/fleet/FleetSubNav.tsx`: change `/settings/users` → `/users-access`.

### Design tokens

- Use semantic tokens only (`bg-card`, `text-muted-foreground`, `text-primary`, `bg-success/10`, etc.).
- Preset/chip color variants live in `PresetBadge.tsx` and `ModulePermChip.tsx` using existing badge variants (no inline hex).

### Out of scope

- No schema changes — `rbac_user_roles`, `roles`, `role_permissions`, `user_permission_overrides`, `modules` already exist.
- No new RPCs.
- Leaves existing `/admin/users` (UserManagement mock) and `/settings/permissions` intact.
- No bulk role editing (checkboxes shown but actions land later).
- No invite flow changes — reuses existing `AddUserModal`.
