# STORM Migration Plan — Digby → Gabe

Status: **Stage 0 complete on branch `claude/check-storm-access-0DabB`**. Stages 1–7 require accounts and credentials that only Gabe / Digby can create. This document is the runbook.

---

## 1. Source app architecture

| Area | Value |
|------|-------|
| Frontend | Vite 5 + React 18 + TS + Tailwind + shadcn-ui + `lovable-tagger` |
| Routing | React Router v6, `src/routes/index.tsx`, ~80 lazy pages |
| State / data | TanStack Query, Zustand, React Context (Auth / Branding / Vessel) |
| Backend | Supabase only (no separate API) |
| Source Supabase project ID | `pfvtrtkqkvjbnbaabgpv` |
| Schema | 64 migrations, ~10,875 SQL lines, ~174 tables/views/RPCs |
| Edge Functions | 25, all `verify_jwt = false` (auth enforced inside each function) |
| Auth | Supabase Auth via `@supabase/supabase-js` |
| Storage buckets (in migrations) | `incident-attachments`, `trip-suggestion-attachments`, `development-documents` (all private) |
| 3rd-party integrations | Resend, Airtable, IDEA Marine, Lovable API, AIS provider, geocode, system API |
| Hosting | Lovable |

Modules required by brief (all present): ISM, HR (`compliance/HRPage`), Certificates, Leave Planner (`crew_leave_*`), Hours of Work & Rest (`work_rest_module.sql`, `hours_of_rest_records`), Audit logging (`audit_logs`, `admin_action_log`, `compliance_access_log`, `audit_mode_*`).

---

## 2. Risk register

| # | Risk | Severity | Mitigation |
|---|------|---------|-----------|
| R1 | Hardcoded GitHub PAT in `package.json` (scrubbed in this branch — token still in history; **must be revoked**) | Critical | Revoke on GitHub; consider history rewrite |
| R2 | `.env` was committed (now untracked) | High | Rotate Supabase keys after Gabe is set up |
| R3 | 25 edge functions with `verify_jwt=false` | High | Verify each enforces auth internally before redeploy |
| R4 | "Vessel Management Department" module does not exist in current code | High | **Deferred per instruction.** Plan documented in §7; not executed. |
| R5 | Production data carries crew PII / medical / certificates | High | Schema-only dump; no data migration unless approved per-table |
| R6 | RLS scattered across 64 migrations | Med | Use single schema dump rather than migration replay |
| R7 | Wrong `.env` could silently point Gabe's frontend at prod | High | Add startup assertion (§9) |
| R8 | Storage buckets must be recreated + policies reapplied | Med | Re-run bucket migrations; verify console for extras |
| R9 | Edge function secrets won't exist in new project | Med | Mirror secret names; Gabe supplies values |
| R10 | `auth.users` are project-scoped; cannot clone | Med | Re-invite admins |
| R11 | DNS / custom domain is single-tenant | Low | Manual on Gabe's side |
| R12 | Lovable project ID placeholder in README | Low | Update after import |

---

## 3. Stage-by-stage runbook

### Stage 0 — Local hygiene  ✅ complete on this branch
- Scrubbed leaked PAT from `package.json` (`repository.url`).
- Added `.env`, `.env.*` to `.gitignore`; kept `!.env.example`.
- Created `.env.example` template.
- Untracked existing `.env` via `git rm --cached .env`.
- Captured baseline: build ✅, tsc --noEmit ✅, vitest 311/311 ✅, lint = 401 pre-existing errors (matches prior audit, out of scope).

**Manual follow-up (Digby):**
1. Revoke `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` at https://github.com/settings/tokens.
2. Rotate Supabase anon key for the production project (Settings → API → Reset).
3. Locally, repopulate `.env` from `.env.example` with current values (or re-rotated values).

### Stage 1 — Gabe's GitHub repo  (manual)
1. Gabe creates an empty repo (e.g. `gabe-org/storm-app`).
2. From a clean clone of this repo on `main`:
   ```
   git clone --depth=1 git@github.com:digbyberriman-collab/maritime-master.git storm-fresh
   cd storm-fresh
   rm -rf .git
   git init -b main
   git add .
   git commit -m "Initial import from STORM (Digby) — fresh history"
   git remote add origin git@github.com:gabe-org/storm-app.git
   git push -u origin main
   ```
   Fresh history strategy chosen — removes the leaked-token commit chain.
3. In `README.md`, update the Lovable project URL once known.

### Stage 2 — Gabe's Supabase project  (manual + commands)
1. Gabe creates a new Supabase project. Note: region, project ref, anon key, service-role key, DB connection string.
2. **Schema-only dump from source** (run locally where you can authenticate to both projects):
   ```bash
   # Auth
   supabase login

   # Dump source schema (no data)
   supabase db dump \
     --db-url "postgresql://postgres:<SOURCE_DB_PASSWORD>@db.pfvtrtkqkvjbnbaabgpv.supabase.co:5432/postgres" \
     --schema-only \
     > schema.sql

   # Optional: dump roles separately
   supabase db dump \
     --db-url "postgresql://postgres:<SOURCE_DB_PASSWORD>@db.pfvtrtkqkvjbnbaabgpv.supabase.co:5432/postgres" \
     --role-only \
     > roles.sql
   ```
3. **Apply to Gabe's project:**
   ```bash
   psql "postgresql://postgres:<GABE_DB_PASSWORD>@db.<GABE_PROJECT_REF>.supabase.co:5432/postgres" \
     -v ON_ERROR_STOP=1 \
     -f schema.sql
   ```
4. **Recreate storage buckets:**
   ```sql
   INSERT INTO storage.buckets (id, name, public) VALUES
     ('incident-attachments', 'incident-attachments', false),
     ('trip-suggestion-attachments', 'trip-suggestion-attachments', false),
     ('development-documents', 'development-documents', false);
   ```
   Verify the source Supabase Storage console for any additional buckets created outside migrations and replicate them.
5. **Regenerate types** in Gabe's repo:
   ```bash
   supabase gen types typescript \
     --project-id <GABE_PROJECT_REF> \
     > src/integrations/supabase/types.ts
   ```
6. Update `supabase/config.toml` in Gabe's repo:
   ```toml
   project_id = "<GABE_PROJECT_REF>"
   ```

### Stage 3 — Auth & RBAC seed  (Gabe's DB)
1. Auth → Users → Invite `digby.berriman@gmail.com` and Gabe's email.
2. Once both have signed in once (so `auth.users` rows exist), record their UUIDs.
3. Seed RBAC tables — clone the *system-role* rows only from source. From the source DB:
   ```bash
   pg_dump --data-only --table=roles --table=modules --table=role_permissions \
     --inserts \
     "postgresql://postgres:<SOURCE_DB_PASSWORD>@db.pfvtrtkqkvjbnbaabgpv.supabase.co:5432/postgres" \
     > rbac_seed.sql
   ```
   Apply to Gabe's DB:
   ```bash
   psql "<GABE_DB_URL>" -f rbac_seed.sql
   ```
4. Insert admin role assignments for both users:
   ```sql
   INSERT INTO user_roles (user_id, role_id, vessel_id, department, valid_from, is_active)
   SELECT '<DIGBY_UID>', id, NULL, NULL, NOW(), true FROM roles WHERE name = 'dpa';
   INSERT INTO user_roles (user_id, role_id, vessel_id, department, valid_from, is_active)
   SELECT '<GABE_UID>',  id, NULL, NULL, NOW(), true FROM roles WHERE name = 'dpa';
   ```

### Stage 4 — Edge functions  (manual + commands)
1. Link Gabe's repo to Gabe's Supabase:
   ```bash
   supabase link --project-ref <GABE_PROJECT_REF>
   ```
2. Deploy all functions:
   ```bash
   supabase functions deploy --no-verify-jwt
   ```
   The flag matches the per-function `verify_jwt = false` already in `config.toml`. **Confirm each function enforces auth internally before deploying.**
3. Set secrets:
   ```bash
   supabase secrets set \
     RESEND_API_KEY=... \
     EMAIL_FROM="STORM <noreply@…>" \
     Airtable=... \
     IDEA_API_KEY=... \
     IDEA_BASE_URL=https://api.idea-marine.com \
     LOVABLE_API_KEY=... \
     AIS_API_KEY=... \
     AIS_PROVIDER=mock \
     SYSTEM_API_KEY=...
   ```

### Stage 5 — Frontend env  (Gabe's Lovable)
1. In Lovable → Project Settings → Environment:
   - `VITE_SUPABASE_URL = https://<GABE_PROJECT_REF>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY = <gabe anon key>`
   - `VITE_APP_VERSION = 1.0.0`
2. (Optional defensive) add startup assertion in `src/integrations/supabase/client.ts`:
   ```ts
   if (SUPABASE_URL.includes('pfvtrtkqkvjbnbaabgpv')) {
     throw new Error('Refusing to start: frontend is pointing at the production Supabase project.');
   }
   ```

### Stage 6 — Validate
- `npm ci && npm run build && npx tsc --noEmit && npm test`
- Sign in as Digby + Gabe; confirm dashboard renders.
- Confirm a third test user cannot view modules without role assignment.
- Watch browser devtools → Network. **No requests** should hit `pfvtrtkqkvjbnbaabgpv.supabase.co`.
- Compare schema: `supabase db diff` between source and target should be empty.

### Stage 7 — Cutover (Gabe's discretion)
- Custom domain via Lovable + DNS.
- Resend sender domain verification.
- Lovable Publish.

---

## 4. Manual actions (cannot be automated from CLI)

| # | Action | Owner |
|---|-------|-------|
| M1 | Revoke leaked GitHub PAT | Digby |
| M2 | Rotate source Supabase anon key | Digby |
| M3 | Create Gabe's GitHub repo | Gabe |
| M4 | Create Gabe's Lovable project (Import from GitHub) | Gabe |
| M5 | Create Gabe's Supabase project | Gabe |
| M6 | Supabase Auth: templates, redirect URLs, SMTP | Gabe |
| M7 | Invite admins in Auth | Gabe |
| M8 | Set 9 edge function secrets | Gabe |
| M9 | Set 3 Vite env vars in Lovable | Gabe |
| M10 | Custom domain / DNS (if any) | Gabe |
| M11 | Issue new API keys with each provider (Resend, Airtable, IDEA, AIS, Lovable, system) | Gabe |

---

## 5. Required environment variables

**Frontend (`.env`):**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_APP_VERSION=1.0.0
```

**Edge function secrets (Supabase → Edge Functions → Secrets):**
```
SUPABASE_URL                  (auto)
SUPABASE_ANON_KEY             (auto)
SUPABASE_SERVICE_ROLE_KEY     (auto)
RESEND_API_KEY                <new>
EMAIL_FROM                    STORM <noreply@…>
Airtable                      <new>
IDEA_API_KEY                  <new>
IDEA_BASE_URL                 https://api.idea-marine.com
LOVABLE_API_KEY               <new>
AIS_API_KEY                   <new>
AIS_PROVIDER                  mock | <provider>
SYSTEM_API_KEY                <new>
```

---

## 6. Database migration plan

- Source: `pfvtrtkqkvjbnbaabgpv`.
- Method: **schema-only dump** (not migration replay). Faster + atomic, avoids ordering issues across 64 migrations.
- Commands: see Stage 2.
- Tables to NOT seed with prod data: `crew_*`, `incidents`, `audit_logs`, `documents`, `*_attachments`, `hours_of_rest_records`, `crew_leave_*`, `flight_*`, `emergency_contacts`, `insurance_*`, `development_*`, `gdpr_requests`, `login_history`, `form_submissions`, `form_signatures`, plus anything containing PII.
- Tables to seed (system / config only): `roles`, `modules`, `role_permissions`, `module_permissions`, `drill_types`, `equipment_categories`, `document_categories`, `form_categories`, `data_retention_policies`, `fleet_emergency_defaults`, `fleet_emergency_team_defaults`, `emergency_procedures` (review first), `custom_tags` (review first), `document_naming_rules`.

---

## 7. Vessel Management Department restriction — **deferred**

Per instruction the SQL is documented but **not executed**.

Pseudo-SQL (final names depend on the eventual module key):
```sql
-- 1) Add module
INSERT INTO modules (key, name, description, sort_order, is_active, supports_scoping, api_accessible)
VALUES ('vessel_management_department', 'Vessel Management Department',
        'Restricted module. Admins: Digby, Gabe only.', 999, true, false, false);

-- 2) Block default role-permission grants for this module
DELETE FROM role_permissions WHERE module_key = 'vessel_management_department';

-- 3) Allow-list override for Digby + Gabe
INSERT INTO user_permission_overrides
  (user_id, module_key, permission, is_granted, scope, restrictions, reason, created_by, created_at)
VALUES
  ('<DIGBY_UID>', 'vessel_management_department', 'admin', true, 'fleet', '{}'::jsonb,
   'Allow-listed admin per migration brief', '<DIGBY_UID>', NOW()),
  ('<GABE_UID>',  'vessel_management_department', 'admin', true, 'fleet', '{}'::jsonb,
   'Allow-listed admin per migration brief', '<DIGBY_UID>', NOW());

-- 4) RLS policy template — repeated per table belonging to the module
CREATE POLICY vmd_admin_only ON <table_name>
  FOR ALL TO authenticated
  USING (auth.uid() IN ('<DIGBY_UID>'::uuid, '<GABE_UID>'::uuid))
  WITH CHECK (auth.uid() IN ('<DIGBY_UID>'::uuid, '<GABE_UID>'::uuid));
```

Note: bypass of global `dpa` role requires that the application's permission helper consults RLS truth, not just role-table membership. The `get_user_permissions_full` / `get_user_rbac_permissions` RPCs must include `user_permission_overrides` results — verify before applying in prod.

---

## 8. Auth & roles migration plan

- `auth.users` is per-project; not copied. Re-invite Digby + Gabe.
- Mirror `roles` + `modules` + `role_permissions` from source via `pg_dump --data-only --inserts` (Stage 3).
- Assign `dpa` role to both admins.
- Apply VMD restriction (§7) — deferred.
- All seed inserts wrapped so `audit_logs` records the actor for chain-of-custody integrity.

---

## 9. Final validation checklist

- [ ] `npm run build` green on Gabe's repo
- [ ] `npx tsc --noEmit` green
- [ ] `npm test` green (311 expected)
- [ ] Sign-in works for Digby + Gabe in new env
- [ ] Third test user without role can sign in but sees no modules
- [ ] Browser devtools: no request hits `pfvtrtkqkvjbnbaabgpv.supabase.co`
- [ ] `supabase db diff` shows no schema drift vs source
- [ ] ISM, HR, Certificates, Leave Planner, Hours of Work & Rest pages render
- [ ] Audit log records the test sign-ins
- [ ] Source production untouched (sanity-check `updated_at` on a known row)
- [ ] Lovable Publish works for Gabe's project
