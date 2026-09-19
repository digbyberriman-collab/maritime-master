-- =================================================================
-- LEGAL SUPPORT & TICKETING MODULE
-- =================================================================
-- Ported from Inkfleet. Table and column names from the original module
-- are kept unchanged; STORM-specific columns are additive (company_id,
-- profile_id, source_id, form_schema, search_vector).
--
-- 1. legal RBAC module, legal_counsel role, legal_can_* helpers
-- 2. legal_requests: reference numbers, server-side SLA (business days),
--    resolved_at stamping, privileged-column guard for requesters
-- 3. legal_request_comments
-- 4. legal_request_events: trigger-fed audit trail
-- 5. legal_document_templates / legal_document_versions (+ full-text search)
-- 6. legal_form_submissions
-- 7. In-app alerts: lifecycle trigger + legal_generate_alerts SLA sweeper
-- 8. legal-attachments storage bucket
-- 9. RPCs: legal_team_directory, legal_search_documents, legal_sla_deadline
-- =================================================================

-- ---------------------------------------------------------------
-- 1. RBAC module, role and helpers
-- ---------------------------------------------------------------
INSERT INTO public.modules (key, name, description, route, icon, sort_order, is_active)
VALUES ('legal', 'Legal', 'Legal requests, document templates and forms', '/departments/legal', 'Scale', 26, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.modules (key, name, description, sort_order, is_active) VALUES
  ('legal.manage_requests', 'Can manage legal requests', 'Triage, assign, risk-rate and resolve legal requests', 940, true),
  ('legal.manage_documents', 'Can manage legal documents', 'Author, version and approve legal document templates and forms', 941, true)
ON CONFLICT (key) DO NOTHING;

-- The legal team is a first-class role so it can be granted from the
-- existing Roles & Permissions screen.
INSERT INTO public.roles (name, display_name, description, default_scope, is_system_role, is_api_only, is_time_limited)
VALUES ('legal_counsel', 'Legal Counsel', 'Legal team: triages and resolves legal requests, owns legal document templates and forms', 'fleet', true, false, false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'legal', 'admin'::permission_level, 'fleet'::role_scope_type FROM public.roles r WHERE r.name IN ('superadmin', 'dpa')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'legal', 'edit'::permission_level, 'fleet'::role_scope_type FROM public.roles r WHERE r.name = 'legal_counsel'
ON CONFLICT DO NOTHING;

-- Mirrors resolveLegalAccess in src/modules/auth/lib/legalAccess.ts.
CREATE OR REPLACE FUNCTION public.legal_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.rbac_company_permission(_user_id, 'legal', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management');
$$;

CREATE OR REPLACE FUNCTION public.legal_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.legal_can_admin(_user_id)
    OR public.rbac_company_permission(_user_id, 'legal', 'edit');
$$;

CREATE OR REPLACE FUNCTION public.legal_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.legal_can_edit(_user_id)
    OR public.rbac_company_permission(_user_id, 'legal', 'view');
$$;

COMMENT ON FUNCTION public.legal_can_edit IS 'True for the legal team (legal_counsel role, RBAC legal edit/admin, DPA, superadmin). Everyone else only ever sees their own requests and submissions.';

REVOKE ALL ON FUNCTION public.legal_can_admin(uuid), public.legal_can_edit(uuid), public.legal_can_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_can_admin(uuid), public.legal_can_edit(uuid), public.legal_can_view(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. SLA helpers (business days = Monday to Friday)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_add_business_days(p_from timestamptz, p_days integer)
RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  d timestamptz := p_from;
  n integer := 0;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN RETURN p_from; END IF;
  WHILE n < p_days LOOP
    d := d + interval '1 day';
    IF EXTRACT(ISODOW FROM d) < 6 THEN n := n + 1; END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- low = 10 business days, medium (Standard) = 5, high = 2, urgent = 24 hours.
CREATE OR REPLACE FUNCTION public.legal_sla_deadline(p_priority text, p_from timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE p_priority
    WHEN 'urgent' THEN p_from + interval '24 hours'
    WHEN 'high' THEN public.legal_add_business_days(p_from, 2)
    WHEN 'low' THEN public.legal_add_business_days(p_from, 10)
    ELSE public.legal_add_business_days(p_from, 5)
  END;
$$;

REVOKE ALL ON FUNCTION public.legal_add_business_days(timestamptz, integer), public.legal_sla_deadline(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_add_business_days(timestamptz, integer), public.legal_sla_deadline(text, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. legal_requests
-- ---------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.legal_request_ref_seq;

CREATE TABLE IF NOT EXISTS public.legal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  request_type text NOT NULL
    CHECK (request_type IN ('nda', 'contract_review', 'contractor_agreement', 'employment', 'regulatory_compliance', 'ip_commercial', 'general_inquiry')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'triaged', 'in_progress', 'under_review', 'completed', 'cancelled')),
  risk_level text DEFAULT 'medium' CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high')),
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

COMMENT ON COLUMN public.legal_requests.cfm_employee_id IS 'Inkfleet crew record id, kept for re-import. STORM links crew through profile_id.';
COMMENT ON COLUMN public.legal_requests.source_id IS 'Id of the row in the system it was imported from; re-imports upsert on (company_id, source_id).';
COMMENT ON COLUMN public.legal_requests.attachments IS 'Array of {path, name, size, mime_type, uploaded_by, uploaded_at} objects in the legal-attachments bucket.';

CREATE INDEX IF NOT EXISTS idx_legal_requests_company_status ON public.legal_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_legal_requests_submitted_by ON public.legal_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_legal_requests_assigned_to ON public.legal_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_legal_requests_sla ON public.legal_requests(sla_deadline) WHERE status NOT IN ('completed', 'cancelled');
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_requests_source ON public.legal_requests(company_id, source_id) WHERE source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.legal_requests_before_insert()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := 'LEG-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.legal_request_ref_seq')::text, 3, '0');
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(NEW.submitted_by);
  END IF;
  IF NEW.sla_deadline IS NULL THEN
    NEW.sla_deadline := public.legal_sla_deadline(NEW.priority, COALESCE(NEW.created_at, now()));
  END IF;
  IF NEW.status = 'completed' AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Requesters may edit the descriptive fields of their own request and
-- cancel it; everything the legal team owns (status, assignment, risk,
-- priority, SLA, resolution) is rejected unless the caller is on the team.
CREATE OR REPLACE FUNCTION public.legal_requests_before_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  NEW.updated_at := now();

  IF v_uid IS NOT NULL AND NOT public.legal_can_edit(v_uid) THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status <> 'cancelled' OR OLD.status NOT IN ('submitted', 'triaged') THEN
        RAISE EXCEPTION 'Only the legal team can change the status of a request';
      END IF;
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.resolution_summary IS DISTINCT FROM OLD.resolution_summary
       OR NEW.sla_deadline IS DISTINCT FROM OLD.sla_deadline
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
       OR NEW.request_type IS DISTINCT FROM OLD.request_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
      RAISE EXCEPTION 'Only the legal team can change assignment, risk, priority, SLA or resolution';
    END IF;
    IF OLD.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'A closed request can no longer be edited';
    END IF;
  END IF;

  -- Priority change re-derives the SLA from the submission time unless the
  -- caller set an explicit deadline in the same update.
  IF NEW.priority IS DISTINCT FROM OLD.priority
     AND NEW.sla_deadline IS NOT DISTINCT FROM OLD.sla_deadline
     AND NEW.status NOT IN ('completed', 'cancelled') THEN
    NEW.sla_deadline := public.legal_sla_deadline(NEW.priority, OLD.created_at);
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
  ELSIF NEW.status <> 'completed' AND OLD.status = 'completed' THEN
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_requests_before_insert ON public.legal_requests;
CREATE TRIGGER trg_legal_requests_before_insert BEFORE INSERT ON public.legal_requests
  FOR EACH ROW EXECUTE FUNCTION public.legal_requests_before_insert();
DROP TRIGGER IF EXISTS trg_legal_requests_before_update ON public.legal_requests;
CREATE TRIGGER trg_legal_requests_before_update BEFORE UPDATE ON public.legal_requests
  FOR EACH ROW EXECUTE FUNCTION public.legal_requests_before_update();

REVOKE ALL ON FUNCTION public.legal_requests_before_insert(), public.legal_requests_before_update() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- 3. legal_request_comments
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.legal_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  comment_type text NOT NULL DEFAULT 'comment'
    CHECK (comment_type IN ('comment', 'status_change', 'assignment', 'internal_note')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_request_comments_request ON public.legal_request_comments(request_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_request_comments_source ON public.legal_request_comments(request_id, source_id) WHERE source_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 4. legal_request_events (audit trail)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.legal_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  field text,
  old_value text,
  new_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_request_events_request ON public.legal_request_events(request_id, created_at);

COMMENT ON TABLE public.legal_request_events IS 'Immutable audit trail of legal_requests. Written only by the legal_requests_after_change trigger.';

CREATE OR REPLACE FUNCTION public.legal_requests_after_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old_count integer;
  v_new_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, new_value, metadata)
    VALUES (NEW.id, NEW.company_id, COALESCE(v_actor, NEW.submitted_by), 'created', NEW.status,
      jsonb_build_object('priority', NEW.priority, 'request_type', NEW.request_type, 'sla_deadline', NEW.sla_deadline));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, field, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, v_actor, 'status_changed', 'status', OLD.status, NEW.status);
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, field, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, v_actor, 'assigned', 'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text);
  END IF;
  IF NEW.risk_level IS DISTINCT FROM OLD.risk_level THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, field, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, v_actor, 'risk_changed', 'risk_level', OLD.risk_level, NEW.risk_level);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, field, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, v_actor, 'priority_changed', 'priority', OLD.priority, NEW.priority);
  END IF;
  IF NEW.sla_deadline IS DISTINCT FROM OLD.sla_deadline THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, field, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, v_actor, 'sla_changed', 'sla_deadline', OLD.sla_deadline::text, NEW.sla_deadline::text);
  END IF;
  IF NEW.resolution_summary IS DISTINCT FROM OLD.resolution_summary THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, field, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, v_actor, 'resolution_updated', 'resolution_summary', OLD.resolution_summary, NEW.resolution_summary);
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.counterparty IS DISTINCT FROM OLD.counterparty OR NEW.contract_value IS DISTINCT FROM OLD.contract_value
     OR NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction OR NEW.requested_deadline IS DISTINCT FROM OLD.requested_deadline THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type)
    VALUES (NEW.id, NEW.company_id, v_actor, 'details_edited');
  END IF;

  v_old_count := COALESCE(jsonb_array_length(OLD.attachments), 0);
  v_new_count := COALESCE(jsonb_array_length(NEW.attachments), 0);
  IF v_new_count > v_old_count THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, field, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, v_actor, 'attachment_added', 'attachments', v_old_count::text, v_new_count::text);
  ELSIF v_new_count < v_old_count THEN
    INSERT INTO public.legal_request_events (request_id, company_id, actor_id, event_type, field, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, v_actor, 'attachment_removed', 'attachments', v_old_count::text, v_new_count::text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_requests_after_change ON public.legal_requests;
CREATE TRIGGER trg_legal_requests_after_change AFTER INSERT OR UPDATE ON public.legal_requests
  FOR EACH ROW EXECUTE FUNCTION public.legal_requests_after_change();
REVOKE ALL ON FUNCTION public.legal_requests_after_change() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- 5. legal_document_templates / legal_document_versions
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_type text NOT NULL DEFAULT 'template',
  category text NOT NULL DEFAULT 'general',
  department text NOT NULL DEFAULT 'Legal',
  description text,
  current_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'under_review', 'archived')),
  tags text[] NOT NULL DEFAULT '{}',
  linked_table text,
  linked_data_key text,
  is_prerequisite_gate boolean NOT NULL DEFAULT false,
  validity_months integer,
  created_by uuid,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_document_templates_company ON public.legal_document_templates(company_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_document_templates_source ON public.legal_document_templates(company_id, source_id) WHERE source_id IS NOT NULL;

COMMENT ON COLUMN public.legal_document_templates.document_type IS '"template" (rich text document) or "form" (schema-driven form built in the form builder).';

CREATE TABLE IF NOT EXISTS public.legal_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.legal_document_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  content text NOT NULL DEFAULT '',
  form_schema jsonb,
  change_summary text,
  authored_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded')),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_legal_document_versions_template ON public.legal_document_versions(template_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_legal_document_versions_search ON public.legal_document_versions USING gin(search_vector);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_document_versions_source ON public.legal_document_versions(template_id, source_id) WHERE source_id IS NOT NULL;

COMMENT ON COLUMN public.legal_document_versions.content IS 'Markdown body of the version. Rendered with the module''s own safe renderer (no raw HTML).';
COMMENT ON COLUMN public.legal_document_versions.form_schema IS 'FormSchema JSON ({title, description?, fields: FormField[]}) for form templates.';

CREATE OR REPLACE FUNCTION public.legal_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.legal_touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_legal_document_templates_updated_at ON public.legal_document_templates;
CREATE TRIGGER trg_legal_document_templates_updated_at BEFORE UPDATE ON public.legal_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.legal_touch_updated_at();

-- Approving a version supersedes every earlier approved version and
-- activates the template, so "current" is always unambiguous.
CREATE OR REPLACE FUNCTION public.legal_document_versions_after_approve()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.legal_document_versions
      SET status = 'superseded'
      WHERE template_id = NEW.template_id AND id <> NEW.id AND status = 'approved';
    UPDATE public.legal_document_templates
      SET status = 'active', current_version = GREATEST(current_version, NEW.version_number), updated_at = now()
      WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.legal_document_versions_after_approve() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_legal_document_versions_after_approve ON public.legal_document_versions;
CREATE TRIGGER trg_legal_document_versions_after_approve AFTER UPDATE ON public.legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.legal_document_versions_after_approve();

-- ---------------------------------------------------------------
-- 6. legal_form_submissions
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.legal_document_templates(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.legal_document_versions(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  submitted_for_name text,
  submitted_for_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_form_submissions_template ON public.legal_form_submissions(template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_form_submissions_submitter ON public.legal_form_submissions(submitted_by);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_form_submissions_source ON public.legal_form_submissions(company_id, source_id) WHERE source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.legal_form_submissions_before_write()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(NEW.submitted_by);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.reviewed_by := COALESCE(NEW.reviewed_by, auth.uid());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.legal_form_submissions_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_legal_form_submissions_before_write ON public.legal_form_submissions;
CREATE TRIGGER trg_legal_form_submissions_before_write BEFORE INSERT OR UPDATE ON public.legal_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.legal_form_submissions_before_write();

-- ---------------------------------------------------------------
-- 7. In-app alerts (STORM alerts table, shown in the notification bell)
-- ---------------------------------------------------------------
-- Alerts are visible company-wide, so titles carry the reference number
-- and request type only, never the request title.
CREATE OR REPLACE FUNCTION public.legal_request_type_label(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'nda' THEN 'NDA'
    WHEN 'contract_review' THEN 'Service Agreement'
    WHEN 'contractor_agreement' THEN 'Contractor Agreement'
    WHEN 'employment' THEN 'Employment'
    WHEN 'regulatory_compliance' THEN 'Regulatory'
    WHEN 'ip_commercial' THEN 'IP Review'
    WHEN 'general_inquiry' THEN 'General Inquiry'
    ELSE coalesce(p_type, 'Legal request')
  END;
$$;
REVOKE ALL ON FUNCTION public.legal_request_type_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_request_type_label(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.legal_requests_notify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label text := public.legal_request_type_label(NEW.request_type);
  v_severity public.alert_severity;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.alerts (company_id, vessel_id, alert_type, title, description, severity_color, status, source_module,
      related_entity_type, related_entity_id, due_at, owner_role, metadata)
    VALUES (NEW.company_id, NEW.vessel_id, 'legal_request_submitted',
      NEW.reference_number || ': new ' || v_label || ' request',
      'A ' || lower(NEW.priority) || ' priority legal request is waiting for triage.',
      CASE WHEN NEW.priority = 'urgent' THEN 'ORANGE' ELSE 'YELLOW' END::public.alert_severity,
      'OPEN', 'legal', 'legal_request', NEW.id::text, NEW.sla_deadline, 'LEGAL',
      jsonb_build_object('priority', NEW.priority, 'request_type', NEW.request_type));
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.alerts (company_id, vessel_id, alert_type, title, description, severity_color, status, source_module,
      related_entity_type, related_entity_id, due_at, owner_role, owner_user_id, assigned_to_user_id, assigned_at, is_direct_assignment, metadata)
    VALUES (NEW.company_id, NEW.vessel_id, 'legal_request_assigned',
      NEW.reference_number || ': ' || v_label || ' request assigned to you',
      'You have been assigned a legal request. SLA deadline ' || to_char(NEW.sla_deadline, 'DD Mon YYYY HH24:MI') || '.',
      'YELLOW', 'OPEN', 'legal', 'legal_request', NEW.id::text, NEW.sla_deadline, 'LEGAL', NEW.assigned_to, NEW.assigned_to, now(), true,
      jsonb_build_object('priority', NEW.priority, 'request_type', NEW.request_type));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_severity := (CASE WHEN NEW.status IN ('completed', 'cancelled') THEN 'GREEN' ELSE 'YELLOW' END)::public.alert_severity;
    INSERT INTO public.alerts (company_id, vessel_id, alert_type, title, description, severity_color, status, source_module,
      related_entity_type, related_entity_id, owner_role, owner_user_id, metadata)
    VALUES (NEW.company_id, NEW.vessel_id, 'legal_request_status',
      NEW.reference_number || ': ' || v_label || ' request is now ' || replace(NEW.status, '_', ' '),
      CASE WHEN NEW.status = 'completed' THEN 'Your legal request has been completed.' ELSE 'The status of your legal request changed.' END,
      v_severity, 'OPEN', 'legal', 'legal_request', NEW.id::text, 'REQUESTER', NEW.submitted_by,
      jsonb_build_object('status', NEW.status, 'previous_status', OLD.status));

    IF NEW.status IN ('completed', 'cancelled') THEN
      UPDATE public.alerts
        SET status = 'AUTO_DISMISSED', resolved_at = now(), updated_at = now()
        WHERE source_module = 'legal'
          AND related_entity_type = 'legal_request'
          AND related_entity_id = NEW.id::text
          AND alert_type IN ('legal_request_submitted', 'legal_request_assigned', 'legal_sla_due', 'legal_sla_breached')
          AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.legal_requests_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_legal_requests_notify ON public.legal_requests;
CREATE TRIGGER trg_legal_requests_notify AFTER INSERT OR UPDATE ON public.legal_requests
  FOR EACH ROW EXECUTE FUNCTION public.legal_requests_notify();

-- SLA sweeper: raises / refreshes an alert for every open request whose
-- SLA is due within 24 hours (ORANGE) or already breached (RED), and
-- dismisses alerts for requests that have since been closed. Runs from
-- pg_cron when available; a legal editor can also run it from the UI.
CREATE OR REPLACE FUNCTION public.legal_generate_alerts(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := p_company_id;
  r record;
  v_type text;
  v_severity public.alert_severity;
  v_title text;
  v_existing uuid;
  v_count integer := 0;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT public.legal_can_edit(v_uid) THEN
      RAISE EXCEPTION 'Only the legal team can generate legal alerts';
    END IF;
    v_company := public.get_user_company_id(v_uid);
  END IF;

  FOR r IN
    SELECT q.id, q.company_id, q.vessel_id, q.reference_number, q.request_type, q.priority, q.sla_deadline, q.assigned_to,
           EXTRACT(EPOCH FROM (q.sla_deadline - now())) / 3600.0 AS hours_left
    FROM public.legal_requests q
    WHERE q.status NOT IN ('completed', 'cancelled')
      AND q.sla_deadline IS NOT NULL
      AND (v_company IS NULL OR q.company_id = v_company)
      AND q.sla_deadline <= now() + interval '24 hours'
  LOOP
    IF r.hours_left < 0 THEN
      v_type := 'legal_sla_breached';
      v_severity := 'RED';
      v_title := r.reference_number || ': SLA breached ' ||
        CASE WHEN -r.hours_left >= 48 THEN floor(-r.hours_left / 24)::text || ' days ago'
             ELSE floor(-r.hours_left)::text || ' h ago' END;
    ELSE
      v_type := 'legal_sla_due';
      v_severity := 'ORANGE';
      v_title := r.reference_number || ': SLA due in ' || GREATEST(0, floor(r.hours_left))::text || ' h';
    END IF;

    -- A breach supersedes a due-soon alert for the same request.
    IF v_type = 'legal_sla_breached' THEN
      UPDATE public.alerts SET status = 'AUTO_DISMISSED', resolved_at = now(), updated_at = now()
      WHERE source_module = 'legal' AND alert_type = 'legal_sla_due' AND related_entity_id = r.id::text
        AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED');
    END IF;

    SELECT id INTO v_existing FROM public.alerts
    WHERE company_id = r.company_id AND alert_type = v_type AND related_entity_id = r.id::text
      AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.alerts SET title = v_title, severity_color = v_severity, due_at = r.sla_deadline, updated_at = now(),
        metadata = jsonb_build_object('priority', r.priority, 'request_type', r.request_type, 'hours_left', round(r.hours_left::numeric, 1))
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.alerts (company_id, vessel_id, alert_type, title, description, severity_color, status, source_module,
        related_entity_type, related_entity_id, due_at, owner_role, owner_user_id, assigned_to_user_id, metadata)
      VALUES (r.company_id, r.vessel_id, v_type, v_title,
        public.legal_request_type_label(r.request_type) || ' request, ' || r.priority || ' priority. SLA deadline ' || to_char(r.sla_deadline, 'DD Mon YYYY HH24:MI') || '.',
        v_severity, 'OPEN', 'legal', 'legal_request', r.id::text, r.sla_deadline, 'LEGAL', r.assigned_to, r.assigned_to,
        jsonb_build_object('priority', r.priority, 'request_type', r.request_type, 'hours_left', round(r.hours_left::numeric, 1)));
      v_count := v_count + 1;
    END IF;
  END LOOP;

  UPDATE public.alerts a SET status = 'AUTO_DISMISSED', resolved_at = now(), updated_at = now()
  WHERE a.source_module = 'legal'
    AND a.alert_type IN ('legal_sla_due', 'legal_sla_breached')
    AND a.status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    AND (v_company IS NULL OR a.company_id = v_company)
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_requests q
      WHERE q.id::text = a.related_entity_id
        AND q.status NOT IN ('completed', 'cancelled')
        AND q.sla_deadline <= now() + interval '24 hours'
    );

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.legal_generate_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_generate_alerts(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('legal-generate-alerts', '15 * * * *', $cron$SELECT public.legal_generate_alerts()$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------
-- 8. Storage: private legal-attachments bucket
--    <company_id>/requests/<request_id>/<file>
--    <company_id>/submissions/<submission_id>/<file>
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('legal-attachments', 'legal-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

CREATE OR REPLACE FUNCTION public.legal_attachment_path_allowed(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parts text[] := storage.foldername(p_name);
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR array_length(parts, 1) < 3 THEN RETURN false; END IF;
  IF parts[1] <> public.get_user_company_id(v_uid)::text THEN RETURN false; END IF;
  IF public.legal_can_edit(v_uid) THEN RETURN true; END IF;
  IF parts[2] = 'requests' THEN
    RETURN EXISTS (SELECT 1 FROM public.legal_requests r WHERE r.id::text = parts[3] AND r.submitted_by = v_uid);
  ELSIF parts[2] = 'submissions' THEN
    RETURN EXISTS (SELECT 1 FROM public.legal_form_submissions s WHERE s.id::text = parts[3] AND s.submitted_by = v_uid);
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.legal_attachment_path_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_attachment_path_allowed(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "legal_attachments_read" ON storage.objects;
CREATE POLICY "legal_attachments_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'legal-attachments' AND public.legal_attachment_path_allowed(name));
DROP POLICY IF EXISTS "legal_attachments_insert" ON storage.objects;
CREATE POLICY "legal_attachments_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'legal-attachments' AND public.legal_attachment_path_allowed(name));
DROP POLICY IF EXISTS "legal_attachments_update" ON storage.objects;
CREATE POLICY "legal_attachments_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'legal-attachments' AND public.legal_attachment_path_allowed(name));
DROP POLICY IF EXISTS "legal_attachments_delete" ON storage.objects;
CREATE POLICY "legal_attachments_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'legal-attachments' AND public.legal_attachment_path_allowed(name));

-- ---------------------------------------------------------------
-- 9. RPCs
-- ---------------------------------------------------------------
-- Legal team members in the caller's company, for the assignment picker.
CREATE OR REPLACE FUNCTION public.legal_team_directory()
RETURNS TABLE (
  user_id uuid,
  profile_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  email text,
  avatar_url text,
  rank text,
  position text,
  level text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.id, p.first_name::text, p.last_name::text, p.preferred_name::text, p.email::text, p.avatar_url::text,
         p.rank::text, p.position::text,
         CASE WHEN public.legal_can_admin(p.user_id) THEN 'admin' ELSE 'edit' END
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
    AND p.company_id = public.get_user_company_id(auth.uid())
    AND coalesce(p.account_status, 'active') <> 'deactivated'
    AND public.legal_can_edit(p.user_id)
  ORDER BY p.last_name, p.first_name;
$$;
REVOKE ALL ON FUNCTION public.legal_team_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_team_directory() TO authenticated, service_role;

-- Full-text search across the current version of every template in the
-- caller's company. websearch syntax: "exact phrase", -excluded, OR.
CREATE OR REPLACE FUNCTION public.legal_search_documents(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  template_id uuid,
  version_id uuid,
  version_number integer,
  rank real,
  headline text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, v.id, v.version_number,
         ts_rank(v.search_vector, websearch_to_tsquery('english', p_query)) AS rank,
         ts_headline('english', v.content, websearch_to_tsquery('english', p_query),
           'MaxWords=24, MinWords=12, StartSel=**, StopSel=**') AS headline
  FROM public.legal_document_templates t
  JOIN public.legal_document_versions v ON v.template_id = t.id AND v.version_number = t.current_version
  WHERE t.company_id = public.get_user_company_id(auth.uid())
    AND coalesce(trim(p_query), '') <> ''
    AND v.search_vector @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC, t.updated_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 20), 100));
$$;
REVOKE ALL ON FUNCTION public.legal_search_documents(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_search_documents(text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 10. Row level security
-- ---------------------------------------------------------------
ALTER TABLE public.legal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_request_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_form_submissions ENABLE ROW LEVEL SECURITY;

-- Anonymous sessions are denied on every table.
DROP POLICY IF EXISTS "legal_requests_anon_deny" ON public.legal_requests;
CREATE POLICY "legal_requests_anon_deny" ON public.legal_requests FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "legal_request_comments_anon_deny" ON public.legal_request_comments;
CREATE POLICY "legal_request_comments_anon_deny" ON public.legal_request_comments FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "legal_request_events_anon_deny" ON public.legal_request_events;
CREATE POLICY "legal_request_events_anon_deny" ON public.legal_request_events FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "legal_document_templates_anon_deny" ON public.legal_document_templates;
CREATE POLICY "legal_document_templates_anon_deny" ON public.legal_document_templates FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "legal_document_versions_anon_deny" ON public.legal_document_versions;
CREATE POLICY "legal_document_versions_anon_deny" ON public.legal_document_versions FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "legal_form_submissions_anon_deny" ON public.legal_form_submissions;
CREATE POLICY "legal_form_submissions_anon_deny" ON public.legal_form_submissions FOR ALL TO anon USING (false) WITH CHECK (false);

-- legal_requests: requesters see and create their own; the legal team
-- reads, updates and deletes everything in the company.
DROP POLICY IF EXISTS "legal_requests_select" ON public.legal_requests;
CREATE POLICY "legal_requests_select" ON public.legal_requests
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_view(auth.uid()))
  );
DROP POLICY IF EXISTS "legal_requests_insert" ON public.legal_requests;
CREATE POLICY "legal_requests_insert" ON public.legal_requests
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "legal_requests_update" ON public.legal_requests;
CREATE POLICY "legal_requests_update" ON public.legal_requests
  FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    OR (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_edit(auth.uid()))
  )
  WITH CHECK (
    submitted_by = auth.uid()
    OR (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_edit(auth.uid()))
  );
DROP POLICY IF EXISTS "legal_requests_delete" ON public.legal_requests;
CREATE POLICY "legal_requests_delete" ON public.legal_requests
  FOR DELETE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_edit(auth.uid()));

-- legal_request_comments: visible to the request owner and the legal team;
-- internal notes only ever reach the legal team.
CREATE OR REPLACE FUNCTION public.legal_request_visible(p_request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.legal_requests r
    WHERE r.id = p_request_id
      AND (r.submitted_by = auth.uid()
           OR (public.user_belongs_to_company(auth.uid(), r.company_id) AND public.legal_can_view(auth.uid())))
  );
$$;
REVOKE ALL ON FUNCTION public.legal_request_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_request_visible(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "legal_request_comments_select" ON public.legal_request_comments;
CREATE POLICY "legal_request_comments_select" ON public.legal_request_comments
  FOR SELECT TO authenticated
  USING (
    public.legal_request_visible(request_id)
    AND (comment_type <> 'internal_note' OR public.legal_can_view(auth.uid()))
  );
DROP POLICY IF EXISTS "legal_request_comments_insert" ON public.legal_request_comments;
CREATE POLICY "legal_request_comments_insert" ON public.legal_request_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.legal_request_visible(request_id)
    AND (comment_type = 'comment' OR public.legal_can_edit(auth.uid()))
  );
DROP POLICY IF EXISTS "legal_request_comments_delete" ON public.legal_request_comments;
CREATE POLICY "legal_request_comments_delete" ON public.legal_request_comments
  FOR DELETE TO authenticated
  USING (public.legal_can_edit(auth.uid()) AND public.legal_request_visible(request_id));

-- legal_request_events: read-only, same visibility as the request.
DROP POLICY IF EXISTS "legal_request_events_select" ON public.legal_request_events;
CREATE POLICY "legal_request_events_select" ON public.legal_request_events
  FOR SELECT TO authenticated
  USING (public.legal_request_visible(request_id));

-- legal_document_templates / versions: any signed-in user in the company
-- can read; only the legal team writes.
DROP POLICY IF EXISTS "legal_document_templates_select" ON public.legal_document_templates;
CREATE POLICY "legal_document_templates_select" ON public.legal_document_templates
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "legal_document_templates_write" ON public.legal_document_templates;
CREATE POLICY "legal_document_templates_write" ON public.legal_document_templates
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_edit(auth.uid()));

CREATE OR REPLACE FUNCTION public.legal_template_company(p_template_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.legal_document_templates WHERE id = p_template_id;
$$;
REVOKE ALL ON FUNCTION public.legal_template_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_template_company(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "legal_document_versions_select" ON public.legal_document_versions;
CREATE POLICY "legal_document_versions_select" ON public.legal_document_versions
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), public.legal_template_company(template_id)));
DROP POLICY IF EXISTS "legal_document_versions_write" ON public.legal_document_versions;
CREATE POLICY "legal_document_versions_write" ON public.legal_document_versions
  FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), public.legal_template_company(template_id)) AND public.legal_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), public.legal_template_company(template_id)) AND public.legal_can_edit(auth.uid()));

-- legal_form_submissions: submitters read and create their own; the legal
-- team reads, reviews and deletes everything in the company.
DROP POLICY IF EXISTS "legal_form_submissions_select" ON public.legal_form_submissions;
CREATE POLICY "legal_form_submissions_select" ON public.legal_form_submissions
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_view(auth.uid()))
  );
DROP POLICY IF EXISTS "legal_form_submissions_insert" ON public.legal_form_submissions;
CREATE POLICY "legal_form_submissions_insert" ON public.legal_form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "legal_form_submissions_update" ON public.legal_form_submissions;
CREATE POLICY "legal_form_submissions_update" ON public.legal_form_submissions
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_edit(auth.uid()));
DROP POLICY IF EXISTS "legal_form_submissions_delete" ON public.legal_form_submissions;
CREATE POLICY "legal_form_submissions_delete" ON public.legal_form_submissions
  FOR DELETE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.legal_can_edit(auth.uid()));

-- ---------------------------------------------------------------
-- 11. Grants (no anon access anywhere)
-- ---------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.legal_requests, public.legal_request_comments, public.legal_document_templates,
  public.legal_document_versions, public.legal_form_submissions
  TO authenticated;
GRANT SELECT ON public.legal_request_events TO authenticated;
GRANT ALL ON
  public.legal_requests, public.legal_request_comments, public.legal_request_events,
  public.legal_document_templates, public.legal_document_versions, public.legal_form_submissions
  TO service_role;
REVOKE ALL ON
  public.legal_requests, public.legal_request_comments, public.legal_request_events,
  public.legal_document_templates, public.legal_document_versions, public.legal_form_submissions
  FROM anon;
GRANT USAGE ON SEQUENCE public.legal_request_ref_seq TO authenticated, service_role;
