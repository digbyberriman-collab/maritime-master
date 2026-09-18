# Legal module

The Legal Support & Ticketing module lives under `src/modules/legal` and the `/departments/legal/*` routes, inside the Vessel › Departments › Management / Office shell (the sidebar "Legal" leaf). It was rebuilt from the Inkfleet module and keeps its table names, column names, hook names and query keys so it can go back; the differences are listed in `src/modules/legal/MIGRATION-NOTES.md`.

## Areas

| Tab | Route | What it does |
|---|---|---|
| Dashboard | `/departments/legal/dashboard` | Open / urgent / average cycle time / SLA compliance tiles, status donut, six-month volume bars, "urgent attention" and "recent activity" lists. Legal team can refresh SLA alerts from here. |
| Requests | `/departments/legal/requests` | Search (title, reference, counterparty), status chips with counts, priority / risk / assignee filters, CSV export. `…/requests/new` is the three-step intake (type cards → details with conditional counterparty / value fields → priority with SLA preview and review summary). `…/requests/:id` shows the stepper, full read-out, thread (comments and internal notes), attachments, audit trail and, for the legal team, status / risk / priority / assignment / resolution controls. |
| Documents | `/departments/legal/documents` | Template library with category / status filters and full-text search across content. `…/documents/:id` is the editor: Markdown editor with preview, version picker, save draft, save as new version (with change summary), approve, version history with line diff, settings (metadata, prerequisite gate, validity, archive). Form-type templates open the form builder instead. |
| Forms | `/departments/legal/forms` | Published forms to fill in, plus the submissions list (own submissions for crew, review queue for the legal team). `…/forms/:templateId/fill` is the schema-driven fill sheet with "filed for" support; `…/forms/:templateId/submissions` is the per-form review queue. Submissions are shown against the version they were filled on and can be approved / rejected with notes or downloaded as a PDF. |

`/departments/legal` and the old placeholder path `/vessel/departments/management/legal` redirect to the dashboard.

## Access model

Two tiers, mirrored in SQL and TypeScript so the UI and row level security agree:

- **Legal team** (`legal_can_edit` / `legal_can_admin` in SQL; `resolveLegalAccess` in `src/modules/auth/lib/legalAccess.ts`): admin = superadmin, DPA (RBAC or legacy `profiles.role` dpa / shore_management) or an RBAC `legal` admin grant; edit = the `legal_counsel` role or an RBAC `legal` edit grant. The team reads, triages, assigns, risk-rates and resolves every request in the company, owns templates and forms, and reviews submissions. Admins can also delete requests.
- **Everyone else** (`self`): raises requests, follows their own (thread, attachments, cancel while still submitted / triaged), reads the document library and fills in published forms. An RBAC `legal` view grant gives read-only oversight of all requests and submissions.

Grant the team from Roles & Permissions by assigning **Legal Counsel** (or a `legal` module permission). `useLegalAccess()` only decides which controls render; the policies and the `legal_requests_before_update` guard are the real boundary. The module never fails open while RBAC is loading.

## Workflow and SLA

Statuses: `submitted → triaged → in_progress → under_review → completed`, plus `cancelled`. Setting `completed` stamps `resolved_at`. Priority drives the SLA server-side: low 10 business days, standard 5, high 2, urgent 24 hours (Monday to Friday, computed by `legal_sla_deadline` on insert and re-derived when the team changes priority). The dashboard's SLA compliance figure is therefore trustworthy. Risk (`low` / `medium` / `high`) is editable by the team only.

Every status, assignment, risk, priority, SLA, resolution, detail and attachment change is written to `legal_request_events` by trigger; the team's status and assignment changes are also logged in the thread as `status_change` / `assignment` comments.

## Notifications

In-app alerts (the notification bell) via STORM's `alerts` table: a new request (owner role LEGAL), an assignment (direct assignment to the team member), a status change (to the requester), and the hourly SLA sweeper `legal_generate_alerts` (due within 24 h → orange, breached → red, auto-dismissed on close). Alert titles carry only the reference number and request type because alerts are company-visible. Email is not wired; the `send-email` edge function can be called from the same trigger points if needed.

## Documents and forms

Document content is Markdown, edited with a toolbar and rendered by the module's own parser (`lib/markdown.ts`) into React elements, so stored content is never injected as HTML. Versions follow draft → approved → superseded; approving supersedes the earlier approved version and activates the template. `lib/diff.ts` provides the line diff shown in the Versions tab. Full-text search runs in Postgres over the current version (`legal_search_documents`).

Forms are a `FormSchema` (`{ title, description?, fields }`) stored on the version's `form_schema`. Field types: text, textarea, checkbox, date, select, heading, paragraph, signature (typed name + acknowledgement + optional drawn signature), reference (vessel or crew member). The builder reorders, duplicates and deletes fields beside a live preview; `validateSubmission` enforces required fields on the fill sheet; `exportSubmissionPdf` renders a completed form, signatures included, with jsPDF.

## Data

Migration: `supabase/migrations/20260918100000_legal_module.sql` (tables, triggers, RLS, grants, RBAC seeds, `legal-attachments` bucket, RPCs, pg_cron job). Generated types were added by hand to `src/integrations/supabase/types.ts` until the next `supabase gen types` run.

Storage: request attachments go to the private `legal-attachments` bucket under `<company_id>/requests/<request_id>/…` and are indexed in `legal_requests.attachments`; reads use signed URLs (`src/modules/legal/lib/storage.ts`).

## Going live

1. Apply the migration (`supabase db push` or through Lovable).
2. Assign the Legal Counsel role to the legal team in Roles & Permissions.
3. If the project has no pg_cron, schedule `select public.legal_generate_alerts();` (service role) hourly, or rely on the dashboard button.
4. Regenerate Supabase types and drop the hand-written blocks when convenient.

## Tests

- `src/modules/legal/lib/*.test.ts`: SLA maths, request filters and intake validation, dashboard metrics, form schema editing and validation, line diff, Markdown parsing, CSV export, storage paths, editor actions.
- `src/test/lib/legalAccess.test.ts`: the access resolver.
- `src/test/legal/wiring.test.ts`: sidebar → routes → pages → tables / RPCs / buckets → migration contract.
