# Addendum — Landlord Ledger

Paste this after `MASTER-PROMPT.md`.

| | |
|---|---|
| **Repo** | `digbyberriman-collab/landlord-ledger` (TanStack Start + React 19; Supabase Auth: email / magic link / Google; Drizzle migrations on top of `supabase/migrations/`) |
| **Catalogue** | `docs/permissions/catalogues/landlord-ledger.json` — 32 subcategories, 121 capabilities (79 T2, 15 T3), 7 stakeholder groups, 11 roles |
| **Draft workbook** | `docs/permissions/workbooks/landlord-ledger-permission-matrix.xlsx` |
| **Checks** | `npm run lint` (`--max-warnings 0`), `npm run typecheck`, `npm test`, `npm run e2e` (Playwright); CI in `.github/workflows/ci.yml` |
| **Migrations** | Drizzle: `drizzle/migrations/000N_*.sql` (next is `0008_…`) |
| **Ground truth docs** | `SITE_MAP.md` (route inventory, AUTH_MODEL), `AUDIT_REPORT.md`, `ACTION_PLAN.md`, `docs/development-plan.md` (F13 = orgs / memberships, deferred to Sprint 5) |
| **Design** | Dark-mode-first, with Abyss `#0A0E14` / Deep `#111722` / Slate `#1C2533` / Drift `#8A94A6` / Signal `#00AFE6` (`src/styles.css`) |

## 1. Current state

- **Single-owner tenancy.** Root tables carry `owner_id = auth.uid()`; property-derived tables go through `is_property_owner()` (`supabase/migrations/20260703120000_secure_owner_scoped_rls.sql`).
  - Owner-scoped roots: `entities, properties, loans, tenancies, valuations, contacts, tenants, documents, bank_transactions, tax_settings, compliance_items, fx_rates`.
  - Property-derived: `mortgages, units, leases, invoices, payments, expenses, maintenance_requests, liabilities`.
- **Team viewers (live):**
  - `team_members` (role CHECK `'viewer'` only; status invited/active/revoked), `is_team_viewer()` and `accept_team_invite()` (`drizzle/migrations/0004_team_access.sql`).
  - Additive read-only SELECT policies. Gated on the paid `team` module.
  - UI: `src/components/team/team-access-section.tsx` in `/settings`, `src/routes/_authenticated/accept-invite.tsx` and `src/hooks/use-team-viewer.ts`.
- **Dormant roles:** `app_role` (owner / tenant / accountant / agent) and `user_roles` (`20260609035922_*.sql`). Their viewer and tenant policies (`20260609050000_*.sql`) were **deliberately dropped** by the security rewrite (`20260703120000`).
  - **Do not restore those policies.** Revive the roles only through new, owner-scoped PMS policies.
- **Entitlements:**
  - `app_module` enum (`property`, `finance`, `team`), `module_subscriptions` and `has_module()`.
  - Client side: `src/components/module-gate.tsx` and `src/hooks/use-entitlements.ts`.
  - **Effective access = entitlement AND capability.** The catalogue's `entitlement` field carries this.
- **Platform admins:** the `platform_admins` table (no client insert path) and `/admin` (`20260704150000_admin_property_delete_finance.sql`).
- **Navigation:** `src/components/app-sidebar.tsx` (CORE, PROPERTY, FINANCE, ACCOUNT, ADMIN_ITEM).
- **Export:** CSV helpers in `src/lib/format.ts`, used by reports, tax and properties. Add `exceljs`.

## 2. Prerequisite: memberships (F13)

PMS needs more than one person per account.
- **Implement F13 as part of Phase 2:** `account_memberships(account_owner_id, user_id, access_set_id, entity_id?, property_ids uuid[]?, status, invited_by, valid_until)`, generalising `team_members`.
- **Existing rows:** each active `team_members` row migrates to a membership with the **Viewer** Access Set. The migration diff must be empty for viewers.
- **Tenants and contractors** are memberships scoped to one property, lease or job (scope `S`).

## 3. Stakeholder groups (the "departments")

| Group | Roles (tier, scope) |
|---|---|
| Ownership | Owner — account holder (command, `A`) · Co-owner / Entity Director (command, `E`) |
| Management | Property Manager (hod, `P`) · Letting Agent (officer, `P`) |
| Finance | Accountant (hod, `A`) · Bookkeeper (officer, `A`) |
| Operations | Maintenance Contractor (own jobs only, `S`) |
| Occupants | Tenant (own lease only, `S`) · Guarantor (own lease, view and sign only) |
| Oversight | Team Viewer (read-only, `A`; today's `is_team_viewer`) |
| Platform | Platform Admin (operator console only) |

**Scopes:** `S` self (own lease / tenant record / assigned jobs) · `P` assigned property · `E` ownership entity · `A` whole account. `levels: { self: S, group: P, unit: E, all: A }`. Property Managers and Letting Agents remap `unit → P`.

## 4. Hard rules specific to this app

1. **Personal Finance (`fin_*` tables, `/finance/*`) is walled off:** T3, `onlyRoles: ['owner']`. It is never shareable with anyone, including Team Viewers, Accountants and Co-owners. RLS stays `owner_id = auth.uid()` only.
2. **Tenant self-service:**
   - Tenants get `view_own` on their tenant record, lease, deposit, invoices, payments, maintenance and compliance certificates for their property.
   - UK law: Gas Safety, EICR and EPC copies must be provided. SA: the relevant CoCs.
   - They get `sign` on their lease and `create` on maintenance requests and payments.
3. **Tenant screening and ID** (Right to Rent / FICA documents, credit checks) is T3, owned by Management with an Owner view. Retain it only as long as the law requires; flag retention in the gap report.
4. **Billing** (`/billing`) is owner only.
5. **Platform Admins** see the operator console only (accounts, vouchers, payment status), never tenant or finance data.
6. **Contractors** see and update only jobs assigned to them.

## 5. Legacy mapping

| Legacy | PMS |
|---|---|
| Account owner (`owner_id = auth.uid()`) | Owner Access Set, scope `A` |
| `team_members` role `viewer`, active | Membership + Viewer Access Set (external tier, `auditVisible` property subcategories, never `fin_*`) |
| `platform_admins` row | Platform Admin |
| Dormant `app_role` owner / tenant / accountant / agent | Owner / Tenant / Accountant / Property Manager (or Letting Agent). **No existing grants to migrate**; policies were dropped. |

## 6. Decisions to surface

1. Should Accountants see tenant names (the draft grants view `A` so invoices make sense) and tenant contact details (T2)?
2. Should Co-owners approve expenses (the draft does), or only the Owner?
3. Guarantor scope: the draft lets guarantors see their tenancy's invoices, since they are liable for arrears. Confirm.
4. Can a sole owner both upload and apply a matrix import (SOD-02 is record-level with a sole-owner exception, logged)?

## 7. Landlord-specific stop conditions

- Any policy change that makes `fin_*` readable by anyone except the owner.
- Reintroducing any policy dropped in `20260703120000_secure_owner_scoped_rls.sql`.
- `npm run lint` (zero warnings) or `npm run e2e` fails.
