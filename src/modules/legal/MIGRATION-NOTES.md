# Legal module: migration notes (STORM → Inkfleet)

Everything the STORM build added on top of the original Inkfleet Legal module,
with the SQL, so the module can be lifted back without surprises. The single
migration is `supabase/migrations/20260919120000_legal_module.sql`; the
statements below are copied from it (bodies shortened where noted).

## Contract kept from Inkfleet

- Table names unchanged: `legal_requests`, `legal_request_comments`,
  `legal_document_templates`, `legal_document_versions`, `legal_form_submissions`.
- Every original column is present with its original name and type. Nothing was
  renamed; STORM-specific columns are additive (listed per table below).
- Hook names and query keys unchanged: `useLegalRequests` (`['legal-requests']`),
  `useLegalComments(requestId)` (`['legal-comments', id]`), `useLegalDocuments`
  (`['legal-document-templates']`), `useDocumentVersions(templateId)`
  (`['legal-document-versions', id]`), `useFormSubmissions(templateId)`
  (`['legal-form-submissions', id]`). STORM appends the company id to the list
  keys; the prefix is the contract.
- Components live under `src/modules/legal/components` (STORM convention); the
  Inkfleet path `src/components/legal/index.ts` is a barrel that re-exports them.
- Every table has `source_id text` for re-imports (see the last section).

## Vocabulary decisions that differ from Inkfleet

| Topic | Inkfleet | STORM |
|---|---|---|
| Legal team | `has_role(uid, 'legal')` / `'admin'` on `user_roles` | `legal_can_edit(uid)` / `legal_can_admin(uid)`: superadmin, DPA, the new `legal_counsel` RBAC role, or an RBAC grant on the `legal` module. The `app_role` enum was **not** extended. |
| Tenant | single tenant | every table carries `company_id`; policies are company-scoped |
| Crew link | `cfm_employee_id integer` | kept, plus `profile_id uuid → profiles(id)` |
| Document content | rich text (HTML) | Markdown, rendered by the module's own React renderer (no HTML injection) |
| Form schema | JSON in `content` | `legal_document_versions.form_schema jsonb` (additive; `content` stays for documents) |
| SLA | computed in the UI | `legal_sla_deadline()` trigger, business days Mon–Fri |
| Attachments | empty jsonb array | jsonb index of objects in the private `legal-attachments` bucket |
| Audit | implied by comments | `legal_request_events` table, trigger-fed |
| Notifications | none | rows in STORM's `alerts` table (in-app bell) + hourly SLA sweeper |

## New / changed database objects

### Sequence

```sql
CREATE SEQUENCE IF NOT EXISTS public.legal_request_ref_seq;
GRANT USAGE ON SEQUENCE public.legal_request_ref_seq TO authenticated, service_role;
```

### RBAC seeds (STORM tables `modules`, `roles`, `role_permissions`)

```sql
INSERT INTO public.modules (key, name, description, route, icon, sort_order, is_active)
VALUES ('legal', 'Legal', 'Legal requests, document templates and forms', '/departments/legal', 'Scale', 26, true)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.modules (key, name, description, sort_order, is_active) VALUES
  ('legal.manage_requests', 'Can manage legal requests', 'Triage, assign, risk-rate and resolve legal requests', 940, true),
  ('legal.manage_documents', 'Can manage legal documents', 'Author, version and approve legal document templates and forms', 941, true)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.roles (name, display_name, description, default_scope, is_system_role, is_api_only, is_time_limited)
VALUES ('legal_counsel', 'Legal Counsel', 'Legal team: triages and resolves legal requests, owns legal document templates and forms', 'fleet', true, false, false)
ON CONFLICT (name) DO NOTHING;
-- superadmin / dpa → legal admin; legal_counsel → legal edit
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'legal', 'admin'::permission_level, 'fleet'::role_scope_type FROM public.roles r WHERE r.name IN ('superadmin', 'dpa')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'legal', 'edit'::permission_level, 'fleet'::role_scope_type FROM public.roles r WHERE r.name = 'legal_counsel'
ON CONFLICT DO NOTHING;
```

Inkfleet equivalent: keep `has_role(uid, 'legal')` and define
`legal_can_edit(uid) := has_role(uid,'legal') OR has_role(uid,'admin')`,
`legal_can_admin(uid) := has_role(uid,'admin')`, `legal_can_view := legal_can_edit`.
Every policy and trigger below calls only those three helpers.

### Helper functions

| Function | Purpose |
|---|---|
| `legal_can_admin(uuid)`, `legal_can_edit(uuid)`, `legal_can_view(uuid)` | access tiers (see above) |
| `legal_add_business_days(timestamptz, integer)` | adds Mon–Fri days |
| `legal_sla_deadline(text priority, timestamptz from = now())` | low 10 bd, medium 5 bd, high 2 bd, urgent 24 h |
| `legal_request_type_label(text)` | request type → label (used in alert titles) |
| `legal_request_visible(uuid request_id)` | owner-or-team visibility, used by comment / event policies |
| `legal_template_company(uuid template_id)` | company of a template, used by version policies |
| `legal_team_directory()` | RPC: legal team members in the caller's company (assignment picker) |
| `legal_search_documents(text query, integer limit = 20)` | RPC: full-text search over current versions |
| `legal_generate_alerts(uuid company_id = NULL)` | SLA sweeper (due within 24 h → ORANGE, breached → RED); cron or legal team |
| `legal_attachment_path_allowed(text name)` | storage policy helper |

```sql
CREATE OR REPLACE FUNCTION public.legal_add_business_days(p_from timestamptz, p_days integer)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE d timestamptz := p_from; n integer := 0;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN RETURN p_from; END IF;
  WHILE n < p_days LOOP
    d := d + interval '1 day';
    IF EXTRACT(ISODOW FROM d) < 6 THEN n := n + 1; END IF;
  END LOOP;
  RETURN d;
END; $$;

CREATE OR REPLACE FUNCTION public.legal_sla_deadline(p_priority text, p_from timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE p_priority
    WHEN 'urgent' THEN p_from + interval '24 hours'
    WHEN 'high' THEN public.legal_add_business_days(p_from, 2)
    WHEN 'low' THEN public.legal_add_business_days(p_from, 10)
    ELSE public.legal_add_business_days(p_from, 5) END; $$;
```

### `legal_requests`

Additive columns: `company_id uuid NOT NULL → companies`, `profile_id uuid → profiles(id)`,
`source_id text`. CHECK constraints on `request_type`, `priority`, `status`, `risk_level`.
`attachments` holds `[{path, name, size, mime_type, uploaded_by, uploaded_at}]`.

```sql
CREATE TABLE IF NOT EXISTS public.legal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('nda','contract_review','contractor_agreement','employment','regulatory_compliance','ip_commercial','general_inquiry')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','triaged','in_progress','under_review','completed','cancelled')),
  risk_level text DEFAULT 'medium' CHECK (risk_level IS NULL OR risk_level IN ('low','medium','high')),
  title text NOT NULL,
  description text,
  counterparty text,
  contract_value numeric,
  currency text DEFAULT 'USD',
  jurisdiction text,
  requested_deadline date,
  sla_deadline timestamptz,
  assigned_to uuid,
  requester_department text,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  cfm_employee_id integer,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution_summary text,
  resolved_at timestamptz,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_requests_source ON public.legal_requests(company_id, source_id) WHERE source_id IS NOT NULL;
```

Triggers (bodies in the migration):

- `trg_legal_requests_before_insert` → `legal_requests_before_insert()`: reference
  `LEG-<YYYY>-<3-digit seq>` (unchanged from Inkfleet), company from the submitter,
  `sla_deadline := legal_sla_deadline(priority, created_at)`, `resolved_at` when
  inserted as completed.
- `trg_legal_requests_before_update` → `legal_requests_before_update()` (SECURITY
  DEFINER): non-team callers may only edit descriptive fields, attachments, and
  cancel while `submitted` / `triaged`; priority change re-derives the SLA unless
  the caller set `sla_deadline` explicitly; `completed` stamps `resolved_at`.
- `trg_legal_requests_after_change` → `legal_requests_after_change()`: writes
  `legal_request_events`.
- `trg_legal_requests_notify` → `legal_requests_notify()`: inserts STORM `alerts`
  rows (submitted, assigned, status changed) and dismisses open ones on close.
  Inkfleet without an `alerts` table can drop this trigger.

### `legal_request_comments`

Additive: `source_id text`. CHECK on `comment_type` (`comment`, `status_change`,
`assignment`, `internal_note`). Unique `(request_id, source_id)` where not null.

```sql
CREATE TABLE IF NOT EXISTS public.legal_request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.legal_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  comment_type text NOT NULL DEFAULT 'comment' CHECK (comment_type IN ('comment','status_change','assignment','internal_note')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### `legal_request_events` (new)

```sql
CREATE TABLE IF NOT EXISTS public.legal_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.legal_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,   -- created, status_changed, assigned, risk_changed, priority_changed,
                              -- sla_changed, resolution_updated, details_edited, attachment_added, attachment_removed
  field text, old_value text, new_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Read-only for clients (SELECT grant only); populated by the trigger.

### `legal_document_templates`

Additive: `company_id`, `source_id`. CHECK on `status`. `document_type` is
`'template'` (Markdown document) or `'form'` (schema-driven form).

```sql
CREATE TABLE IF NOT EXISTS public.legal_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_type text NOT NULL DEFAULT 'template',
  category text NOT NULL DEFAULT 'general',
  department text NOT NULL DEFAULT 'Legal',
  description text,
  current_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','under_review','archived')),
  tags text[] NOT NULL DEFAULT '{}',
  linked_table text, linked_data_key text,
  is_prerequisite_gate boolean NOT NULL DEFAULT false,
  validity_months integer,
  created_by uuid,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### `legal_document_versions`

Additive: `form_schema jsonb`, `search_vector tsvector` (generated, GIN indexed),
`source_id`. CHECK on `status` (`draft`, `approved`, `superseded`).
Trigger `trg_legal_document_versions_after_approve`: approving a version marks
earlier approved versions `superseded`, sets the template `active` and bumps
`current_version`.

```sql
CREATE TABLE IF NOT EXISTS public.legal_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.legal_document_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  content text NOT NULL DEFAULT '',
  form_schema jsonb,
  change_summary text,
  authored_by uuid, approved_by uuid, approved_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','superseded')),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_legal_document_versions_search ON public.legal_document_versions USING gin(search_vector);
```

`content` is Markdown. Inkfleet stores HTML: convert on import (any
HTML→Markdown converter; the renderer ignores raw HTML, so unconverted content
shows as literal text rather than executing).

### `legal_form_submissions`

Additive: `company_id`, `submitted_for_profile_id uuid → profiles(id)`, `source_id`.
CHECK on `status` (`submitted`, `approved`, `rejected`). Trigger
`trg_legal_form_submissions_before_write` fills `company_id`, stamps
`reviewed_at` / `reviewed_by` on approve / reject and `updated_at`.

```sql
CREATE TABLE IF NOT EXISTS public.legal_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.legal_document_templates(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.legal_document_versions(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  submitted_for_name text,
  submitted_for_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  reviewed_by uuid, reviewed_at timestamptz, review_notes text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

`form_data` values: strings, booleans, `{ name, acknowledged, signedAt, image? }`
for signatures (image is a PNG data URL), `{ id, label }` for references.

### Storage bucket

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('legal-attachments', 'legal-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;
-- policies: SELECT / INSERT / UPDATE / DELETE WHERE bucket_id = 'legal-attachments'
--           AND public.legal_attachment_path_allowed(name)
```

Paths: `<company_id>/requests/<request_id>/<ts>-<rand>.<ext>` and
`<company_id>/submissions/<submission_id>/…`. Reads use signed URLs.

### Alerts and scheduling

`legal_requests_notify()` and `legal_generate_alerts()` write to STORM's
`alerts` table (`source_module = 'legal'`, `related_entity_type = 'legal_request'`,
`alert_type` in `legal_request_submitted`, `legal_request_assigned`,
`legal_request_status`, `legal_sla_due`, `legal_sla_breached`). Titles carry only
the reference number and request type because alerts are visible company-wide.

```sql
-- hourly, when pg_cron is installed
SELECT cron.schedule('legal-generate-alerts', '15 * * * *', $$SELECT public.legal_generate_alerts()$$);
```

Without pg_cron, call `select public.legal_generate_alerts();` with the service
role from any scheduler (the HR sweeper edge function is the model), or use the
"Refresh SLA alerts" button on the dashboard.

### Grants and RLS (summary)

- `GRANT SELECT, INSERT, UPDATE, DELETE` to `authenticated` on the five Inkfleet
  tables, `SELECT` only on `legal_request_events`, `ALL` to `service_role`,
  everything revoked from `anon`, plus an explicit `USING (false)` policy for `anon`.
- Requests: read own or (team and same company); insert own; update own (guarded
  by the trigger) or team; delete team.
- Comments: read if request visible and (not internal note or team); insert as
  self if request visible (internal notes team only); delete team.
- Events: read if request visible.
- Templates / versions: read anyone in the company; write team.
- Submissions: read own or team; insert own; update / delete team.

## Re-import contract (`source_id`)

Every migrated row carries `source_id` = the id in the system it came from. Unique
partial indexes make re-imports idempotent:

| Table | Unique on |
|---|---|
| `legal_requests` | `(company_id, source_id)` |
| `legal_request_comments` | `(request_id, source_id)` |
| `legal_document_templates` | `(company_id, source_id)` |
| `legal_document_versions` | `(template_id, source_id)` |
| `legal_form_submissions` | `(company_id, source_id)` |

```sql
INSERT INTO public.legal_requests (company_id, source_id, submitted_by, request_type, priority, status, title, …)
VALUES (…)
ON CONFLICT (company_id, source_id) WHERE source_id IS NOT NULL
DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, …, updated_at = now();
```

Import with the service role: triggers still run (reference numbers are only
generated when `reference_number` is null, so pass the Inkfleet reference to keep
it), the update guard is skipped for service-role sessions (`auth.uid()` is null),
and audit events / alerts are written as system events.
