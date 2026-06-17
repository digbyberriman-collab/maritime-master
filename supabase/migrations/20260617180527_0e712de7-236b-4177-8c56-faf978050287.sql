-- =================================================================
-- NB CONSOLIDATED MIGRATION
-- =================================================================

CREATE OR REPLACE FUNCTION public.nb_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN CREATE TYPE public.nb_decision_status AS ENUM ('idea','active','final','changed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_file_status AS ENUM ('draft','review','approved'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_approval_status AS ENUM ('pending','approved','changes_needed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_requirement_priority AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_change_order_status AS ENUM ('draft','submitted','under_review','approved','in_progress','completed','rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_equipment_status AS ENUM ('proposed','approved','ordered','shipped','delivered','installed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_raid_item_type AS ENUM ('decision','assumption','risk','issue','key_project_risk'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_raid_status AS ENUM ('current','accepted','closed','superseded','action','rejected','question_asked'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_po_status AS ENUM ('draft','reviewed','issued','delivered','closed','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_build_phase_status AS ENUM ('planned','active','completed','on_hold'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_rasci_phase AS ENUM ('design','specify','engineering','purchase','produce','deliver','install','commission','handover'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.nb_rasci_value AS ENUM ('responsible','support','consulted','informed'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.nb_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_projects TO authenticated;
GRANT ALL ON public.nb_projects TO service_role;
ALTER TABLE public.nb_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_projects_auth_all" ON public.nb_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priorities TEXT,
  current_focus TEXT,
  is_interior BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_areas TO authenticated;
GRANT ALL ON public.nb_areas TO service_role;
ALTER TABLE public.nb_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_areas_auth_all" ON public.nb_areas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_areas_updated_at BEFORE UPDATE ON public.nb_areas FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.nb_areas(id) ON DELETE SET NULL,
  name TEXT NOT NULL, company TEXT, role TEXT, notes TEXT, why_involved TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_suppliers TO authenticated;
GRANT ALL ON public.nb_suppliers TO service_role;
ALTER TABLE public.nb_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_suppliers_auth_all" ON public.nb_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_timeline_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  imported_by UUID,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INT DEFAULT 0,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_timeline_imports TO authenticated;
GRANT ALL ON public.nb_timeline_imports TO service_role;
ALTER TABLE public.nb_timeline_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_timeline_imports_auth_all" ON public.nb_timeline_imports FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_build_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  status public.nb_build_phase_status NOT NULL DEFAULT 'planned',
  planned_start_date DATE, planned_end_date DATE,
  actual_start_date DATE, actual_end_date DATE,
  colour TEXT DEFAULT '#2563EB',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_build_phases TO authenticated;
GRANT ALL ON public.nb_build_phases TO service_role;
ALTER TABLE public.nb_build_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_build_phases_auth_all" ON public.nb_build_phases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_build_phases_updated_at BEFORE UPDATE ON public.nb_build_phases FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.nb_build_phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  target_date DATE, actual_date DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_milestones TO authenticated;
GRANT ALL ON public.nb_milestones TO service_role;
ALTER TABLE public.nb_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_milestones_auth_all" ON public.nb_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_milestones_updated_at BEFORE UPDATE ON public.nb_milestones FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_schedule_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  import_id UUID REFERENCES public.nb_timeline_imports(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES public.nb_build_phases(id) ON DELETE SET NULL,
  task_name TEXT NOT NULL,
  start_date DATE, end_date DATE,
  baseline_start_date DATE, baseline_end_date DATE,
  duration_days NUMERIC, percent_complete NUMERIC DEFAULT 0,
  wbs TEXT, outline_level INTEGER DEFAULT 1,
  predecessors TEXT, resource_names TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_schedule_tasks TO authenticated;
GRANT ALL ON public.nb_schedule_tasks TO service_role;
ALTER TABLE public.nb_schedule_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_schedule_tasks_auth_all" ON public.nb_schedule_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_schedule_tasks_updated_at BEFORE UPDATE ON public.nb_schedule_tasks FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.nb_areas(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.nb_suppliers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  decision_text TEXT, reasoning TEXT,
  status public.nb_decision_status NOT NULL DEFAULT 'idea',
  date DATE, notes TEXT,
  file_links JSONB DEFAULT '[]'::jsonb,
  item_type public.nb_raid_item_type NOT NULL DEFAULT 'decision',
  raid_status public.nb_raid_status DEFAULT NULL,
  pending_validation BOOLEAN NOT NULL DEFAULT false,
  assigned_owner TEXT, validated_by UUID, validated_at TIMESTAMPTZ,
  source_reference TEXT, reviewer_comment TEXT, mdal_number TEXT,
  tags TEXT, background TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_decisions TO authenticated;
GRANT ALL ON public.nb_decisions TO service_role;
ALTER TABLE public.nb_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_decisions_auth_all" ON public.nb_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_decisions_updated_at BEFORE UPDATE ON public.nb_decisions FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.nb_areas(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status public.nb_file_status NOT NULL DEFAULT 'draft',
  storage_path TEXT, external_url TEXT, notes TEXT,
  parent_file_id UUID REFERENCES public.nb_files(id) ON DELETE SET NULL,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_files TO authenticated;
GRANT ALL ON public.nb_files TO service_role;
ALTER TABLE public.nb_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_files_auth_all" ON public.nb_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.nb_files(id) ON DELETE CASCADE,
  submitted_by UUID, approver_id UUID,
  status public.nb_approval_status NOT NULL DEFAULT 'pending',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_approvals TO authenticated;
GRANT ALL ON public.nb_approvals TO service_role;
ALTER TABLE public.nb_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_approvals_auth_all" ON public.nb_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.nb_areas(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT,
  priority public.nb_requirement_priority NOT NULL DEFAULT 'medium',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_requirements TO authenticated;
GRANT ALL ON public.nb_requirements TO service_role;
ALTER TABLE public.nb_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_requirements_auth_all" ON public.nb_requirements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_requirements_updated_at BEFORE UPDATE ON public.nb_requirements FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_requirement_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES public.nb_requirements(id) ON DELETE CASCADE,
  deliverable_type TEXT NOT NULL CHECK (deliverable_type IN ('file','decision')),
  deliverable_id UUID NOT NULL,
  linked_by UUID,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requirement_id, deliverable_type, deliverable_id),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_requirement_deliverables TO authenticated;
GRANT ALL ON public.nb_requirement_deliverables TO service_role;
ALTER TABLE public.nb_requirement_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_requirement_deliverables_auth_all" ON public.nb_requirement_deliverables FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.nb_areas(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT, requested_by_name TEXT,
  date_requested DATE DEFAULT CURRENT_DATE,
  status public.nb_change_order_status NOT NULL DEFAULT 'draft',
  cost_impact NUMERIC(12,2) DEFAULT 0,
  schedule_impact_days INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_change_orders TO authenticated;
GRANT ALL ON public.nb_change_orders TO service_role;
ALTER TABLE public.nb_change_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_change_orders_auth_all" ON public.nb_change_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_change_orders_updated_at BEFORE UPDATE ON public.nb_change_orders FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_change_order_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES public.nb_change_orders(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('status_change','comment')),
  from_status TEXT, to_status TEXT, comment TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_change_order_activity TO authenticated;
GRANT ALL ON public.nb_change_order_activity TO service_role;
ALTER TABLE public.nb_change_order_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_change_order_activity_auth_all" ON public.nb_change_order_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_change_order_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES public.nb_change_orders(id) ON DELETE CASCADE,
  deliverable_type TEXT NOT NULL CHECK (deliverable_type IN ('file','decision')),
  deliverable_id UUID NOT NULL,
  linked_by UUID,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(change_order_id, deliverable_type, deliverable_id),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_change_order_deliverables TO authenticated;
GRANT ALL ON public.nb_change_order_deliverables TO service_role;
ALTER TABLE public.nb_change_order_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_change_order_deliverables_auth_all" ON public.nb_change_order_deliverables FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.nb_areas(id) ON DELETE SET NULL,
  name TEXT NOT NULL, description TEXT,
  model_number TEXT, manufacturer TEXT,
  status public.nb_equipment_status NOT NULL DEFAULT 'proposed',
  approved_at TIMESTAMPTZ, approved_by UUID,
  delivery_date DATE, delivery_notes TEXT,
  location_onboard TEXT, notes TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_equipment TO authenticated;
GRANT ALL ON public.nb_equipment TO service_role;
ALTER TABLE public.nb_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_equipment_auth_all" ON public.nb_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_equipment_updated_at BEFORE UPDATE ON public.nb_equipment FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  supplier_id UUID, area_id UUID, equipment_id UUID, schedule_task_id UUID,
  description TEXT, amount NUMERIC(14,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status public.nb_po_status NOT NULL DEFAULT 'draft',
  order_date DATE, promised_delivery_date DATE, actual_delivery_date DATE,
  delay_applied_to_schedule BOOLEAN NOT NULL DEFAULT false,
  delay_applied_days INTEGER, delay_applied_at TIMESTAMPTZ,
  notes TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_purchase_orders TO authenticated;
GRANT ALL ON public.nb_purchase_orders TO service_role;
ALTER TABLE public.nb_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_purchase_orders_auth_all" ON public.nb_purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_nb_po_project ON public.nb_purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_nb_po_status ON public.nb_purchase_orders(status);
CREATE TRIGGER nb_purchase_orders_updated_at BEFORE UPDATE ON public.nb_purchase_orders FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_purchase_order_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.nb_purchase_orders(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  from_status TEXT, to_status TEXT, comment TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_purchase_order_activity TO authenticated;
GRANT ALL ON public.nb_purchase_order_activity TO service_role;
ALTER TABLE public.nb_purchase_order_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_purchase_order_activity_auth_all" ON public.nb_purchase_order_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_yard_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  tags TEXT, file_name TEXT, storage_path TEXT, external_url TEXT,
  uploaded_by UUID,
  doc_type_code TEXT, element_code TEXT, material_code TEXT, seq_code TEXT,
  sheet_number TEXT, revision TEXT, document_number TEXT,
  content_text TEXT, content_indexed_at TIMESTAMPTZ, search_vector TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_yard_standards TO authenticated;
GRANT ALL ON public.nb_yard_standards TO service_role;
ALTER TABLE public.nb_yard_standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_yard_standards_auth_all" ON public.nb_yard_standards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_nb_ys_search ON public.nb_yard_standards USING GIN(search_vector);
CREATE TRIGGER nb_yard_standards_updated_at BEFORE UPDATE ON public.nb_yard_standards FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_regulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  source TEXT, reference_number TEXT, tags TEXT,
  file_name TEXT, storage_path TEXT, external_url TEXT,
  content_text TEXT, content_indexed_at TIMESTAMPTZ, search_vector TSVECTOR,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_regulations TO authenticated;
GRANT ALL ON public.nb_regulations TO service_role;
ALTER TABLE public.nb_regulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_regulations_auth_all" ON public.nb_regulations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_nb_regs_search ON public.nb_regulations USING GIN(search_vector);
CREATE TRIGGER nb_regulations_updated_at BEFORE UPDATE ON public.nb_regulations FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  drawing_number TEXT NOT NULL, revision TEXT NOT NULL,
  title TEXT NOT NULL,
  drawing_type TEXT NOT NULL DEFAULT 'general_arrangement',
  status TEXT, scale TEXT, drawn_by TEXT, drawn_date DATE, imo TEXT,
  storage_path TEXT, page_rotation INTEGER NOT NULL DEFAULT 0,
  page_width_pts NUMERIC, page_height_pts NUMERIC, notes TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_drawings TO authenticated;
GRANT ALL ON public.nb_drawings TO service_role;
ALTER TABLE public.nb_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_drawings_auth_all" ON public.nb_drawings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_drawings_updated_at BEFORE UPDATE ON public.nb_drawings FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_deck_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  drawing_id UUID,
  label TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  image_storage_path TEXT NOT NULL,
  image_width INTEGER NOT NULL, image_height INTEGER NOT NULL,
  source_page_number INTEGER,
  source_crop_x NUMERIC, source_crop_y NUMERIC,
  source_crop_width NUMERIC, source_crop_height NUMERIC,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_deck_views TO authenticated;
GRANT ALL ON public.nb_deck_views TO service_role;
ALTER TABLE public.nb_deck_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_deck_views_auth_all" ON public.nb_deck_views FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_deck_views_updated_at BEFORE UPDATE ON public.nb_deck_views FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_deck_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id UUID REFERENCES public.nb_drawings(id) ON DELETE CASCADE,
  deck_view_id UUID REFERENCES public.nb_deck_views(id) ON DELETE SET NULL,
  area_id UUID REFERENCES public.nb_areas(id) ON DELETE SET NULL,
  deck TEXT NOT NULL, label TEXT NOT NULL,
  bbox_x NUMERIC, bbox_y NUMERIC, bbox_width NUMERIC, bbox_height NUMERIC,
  svg_polygon TEXT,
  source TEXT NOT NULL DEFAULT 'auto',
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_deck_rooms TO authenticated;
GRANT ALL ON public.nb_deck_rooms TO service_role;
ALTER TABLE public.nb_deck_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_deck_rooms_auth_all" ON public.nb_deck_rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_deck_rooms_updated_at BEFORE UPDATE ON public.nb_deck_rooms FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_element_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, code),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_element_codes TO authenticated;
GRANT ALL ON public.nb_element_codes TO service_role;
ALTER TABLE public.nb_element_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_element_codes_auth_all" ON public.nb_element_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_element_codes_updated_at BEFORE UPDATE ON public.nb_element_codes FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_rasci_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_rasci_roles TO authenticated;
GRANT ALL ON public.nb_rasci_roles TO service_role;
ALTER TABLE public.nb_rasci_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_rasci_roles_auth_all" ON public.nb_rasci_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_rasci_roles_updated_at BEFORE UPDATE ON public.nb_rasci_roles FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_rasci_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  element_code_id UUID NOT NULL REFERENCES public.nb_element_codes(id) ON DELETE CASCADE,
  rasci_role_id UUID NOT NULL REFERENCES public.nb_rasci_roles(id) ON DELETE CASCADE,
  phase public.nb_rasci_phase NOT NULL,
  assignment public.nb_rasci_value NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(element_code_id, rasci_role_id, phase),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_rasci_assignments TO authenticated;
GRANT ALL ON public.nb_rasci_assignments TO service_role;
ALTER TABLE public.nb_rasci_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_rasci_assignments_auth_all" ON public.nb_rasci_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_rasci_assignments_updated_at BEFORE UPDATE ON public.nb_rasci_assignments FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_vendor_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.nb_suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, role TEXT, email TEXT, phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_vendor_contacts TO authenticated;
GRANT ALL ON public.nb_vendor_contacts TO service_role;
ALTER TABLE public.nb_vendor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_vendor_contacts_auth_all" ON public.nb_vendor_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  parent_material_id UUID REFERENCES public.nb_materials(id) ON DELETE CASCADE,
  name TEXT NOT NULL, category TEXT, brand TEXT, colour TEXT, finish TEXT,
  swatch_storage_path TEXT, spec_sheet_url TEXT, spec_sheet_file_id UUID,
  fire_rating TEXT,
  imo_certified BOOLEAN NOT NULL DEFAULT false,
  certificate_url TEXT, certificate_file_id UUID,
  notes TEXT, supplier_id UUID,
  selection_status TEXT NOT NULL DEFAULT 'Pending',
  proposed_by TEXT, dimension TEXT, weight TEXT, format TEXT,
  shock_resistance TEXT, scratch_resistance TEXT, stain_resistance TEXT,
  fire_resistance TEXT, water_resistance TEXT, corrosion_resistance TEXT,
  uv_resistance TEXT, acoustic_properties TEXT, maintenance TEXT,
  customizability TEXT, applications TEXT, description TEXT,
  meeting_notes TEXT, supplier_name TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_materials TO authenticated;
GRANT ALL ON public.nb_materials TO service_role;
ALTER TABLE public.nb_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_materials_auth_all" ON public.nb_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_materials_updated_at BEFORE UPDATE ON public.nb_materials FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_material_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.nb_materials(id) ON DELETE CASCADE,
  area_id UUID, location_detail TEXT,
  quantity NUMERIC, unit TEXT, notes TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_material_usages TO authenticated;
GRANT ALL ON public.nb_material_usages TO service_role;
ALTER TABLE public.nb_material_usages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_material_usages_auth_all" ON public.nb_material_usages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_material_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.nb_materials(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_material_status_history TO authenticated;
GRANT ALL ON public.nb_material_status_history TO service_role;
ALTER TABLE public.nb_material_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_material_status_history_auth_all" ON public.nb_material_status_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.nb_room_contractor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  room_id UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.nb_suppliers(id) ON DELETE CASCADE,
  produces_drawing BOOLEAN NOT NULL DEFAULT false,
  creates_detail_booklet BOOLEAN NOT NULL DEFAULT false,
  approves_drawing BOOLEAN NOT NULL DEFAULT false,
  defines_materials BOOLEAN NOT NULL DEFAULT false,
  scope_notes TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, supplier_id),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_room_contractor_assignments TO authenticated;
GRANT ALL ON public.nb_room_contractor_assignments TO service_role;
ALTER TABLE public.nb_room_contractor_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_rca_auth_all" ON public.nb_room_contractor_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_rca_updated_at BEFORE UPDATE ON public.nb_room_contractor_assignments FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_deliverable_schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL, chapter_name TEXT NOT NULL,
  description TEXT NOT NULL,
  builder_info_date TEXT, owner_decision_date TEXT, delivery_by_owner TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  requirement_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_deliverable_schedule_items TO authenticated;
GRANT ALL ON public.nb_deliverable_schedule_items TO service_role;
ALTER TABLE public.nb_deliverable_schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_dsi_auth_all" ON public.nb_deliverable_schedule_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_dsi_updated_at BEFORE UPDATE ON public.nb_deliverable_schedule_items FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  status TEXT DEFAULT 'Basic Engineering',
  number_of_components INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_zones TO authenticated;
GRANT ALL ON public.nb_zones TO service_role;
ALTER TABLE public.nb_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_zones_auth_all" ON public.nb_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_zones_updated_at BEFORE UPDATE ON public.nb_zones FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_subzones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.nb_zones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_subzones TO authenticated;
GRANT ALL ON public.nb_subzones TO service_role;
ALTER TABLE public.nb_subzones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_subzones_auth_all" ON public.nb_subzones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_subzones_updated_at BEFORE UPDATE ON public.nb_subzones FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.nb_zones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, deck_number INTEGER, description TEXT,
  number_of_components INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_decks TO authenticated;
GRANT ALL ON public.nb_decks TO service_role;
ALTER TABLE public.nb_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_decks_auth_all" ON public.nb_decks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_decks_updated_at BEFORE UPDATE ON public.nb_decks FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.nb_decks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  status TEXT DEFAULT 'Basic Engineering',
  number_of_components INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_blocks TO authenticated;
GRANT ALL ON public.nb_blocks TO service_role;
ALTER TABLE public.nb_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_blocks_auth_all" ON public.nb_blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_blocks_updated_at BEFORE UPDATE ON public.nb_blocks FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_location_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES public.nb_blocks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, area_code TEXT,
  number_of_components INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_location_areas TO authenticated;
GRANT ALL ON public.nb_location_areas TO service_role;
ALTER TABLE public.nb_location_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_location_areas_auth_all" ON public.nb_location_areas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_location_areas_updated_at BEFORE UPDATE ON public.nb_location_areas FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_area_id UUID REFERENCES public.nb_location_areas(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, section_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_sections TO authenticated;
GRANT ALL ON public.nb_sections TO service_role;
ALTER TABLE public.nb_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_sections_auth_all" ON public.nb_sections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_sections_updated_at BEFORE UPDATE ON public.nb_sections FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_interior_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  drawing_number TEXT NOT NULL, room_name TEXT NOT NULL,
  deck_name TEXT, design_level TEXT,
  delivery_phase_1 TEXT, delivery_phase_2 TEXT, delivery_phase_3 TEXT,
  deliverables_materials TEXT,
  approval_doc_phase_1 TEXT, approval_doc_phase_2 TEXT,
  approval_doc_phase_3 TEXT, approval_doc_phase_4_5 TEXT,
  rev_a TEXT, rev_b TEXT, rev_c TEXT, rev_d TEXT,
  rev_e TEXT, rev_f TEXT, rev_g TEXT, rev_h TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_interior_drawings TO authenticated;
GRANT ALL ON public.nb_interior_drawings TO service_role;
ALTER TABLE public.nb_interior_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_interior_drawings_auth_all" ON public.nb_interior_drawings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_interior_drawings_updated_at BEFORE UPDATE ON public.nb_interior_drawings FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_piping_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  zone TEXT NOT NULL, block_code TEXT NOT NULL,
  sections TEXT,
  friday_week INTEGER, friday_year INTEGER,
  monday_week INTEGER, monday_year INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_piping_blocks TO authenticated;
GRANT ALL ON public.nb_piping_blocks TO service_role;
ALTER TABLE public.nb_piping_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_piping_blocks_auth_all" ON public.nb_piping_blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_piping_blocks_updated_at BEFORE UPDATE ON public.nb_piping_blocks FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_piping_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, short_label TEXT, code TEXT,
  milestone_type TEXT NOT NULL DEFAULT 'general',
  display_order INTEGER NOT NULL DEFAULT 0,
  tracks_percent BOOLEAN NOT NULL DEFAULT true,
  has_date_markers BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_piping_milestones TO authenticated;
GRANT ALL ON public.nb_piping_milestones TO service_role;
ALTER TABLE public.nb_piping_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_piping_milestones_auth_all" ON public.nb_piping_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_piping_milestones_updated_at BEFORE UPDATE ON public.nb_piping_milestones FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_piping_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES public.nb_piping_blocks(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES public.nb_piping_milestones(id) ON DELETE CASCADE,
  planned_week INTEGER, planned_year INTEGER,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  achieved_week INTEGER, achieved_year INTEGER,
  notes TEXT, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(block_id, milestone_id),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_piping_progress TO authenticated;
GRANT ALL ON public.nb_piping_progress TO service_role;
ALTER TABLE public.nb_piping_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_piping_progress_auth_all" ON public.nb_piping_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_piping_progress_updated_at BEFORE UPDATE ON public.nb_piping_progress FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();

CREATE TABLE IF NOT EXISTS public.nb_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.nb_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, role TEXT, company TEXT, email TEXT, phone TEXT,
  topics TEXT[] NOT NULL DEFAULT '{}',
  key_topics TEXT[] NOT NULL DEFAULT '{}',
  is_key_contact BOOLEAN NOT NULL DEFAULT false,
  notes TEXT, avatar_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_contacts TO authenticated;
GRANT ALL ON public.nb_contacts TO service_role;
ALTER TABLE public.nb_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nb_contacts_auth_all" ON public.nb_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER nb_contacts_updated_at BEFORE UPDATE ON public.nb_contacts FOR EACH ROW EXECUTE FUNCTION public.nb_update_updated_at();