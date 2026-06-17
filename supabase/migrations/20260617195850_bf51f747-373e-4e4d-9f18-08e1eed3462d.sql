
DO $$ BEGIN CREATE TYPE public.frp_rotation_type AS ENUM ('onboard','leave','travel','standby','yard','wfh','temp_cover','training','no_crew','tbc'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.frp_assignment_status AS ENUM ('draft','confirmed','pending_approval','conflict','complete'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.frp_location_status AS ENUM ('confirmed','estimated','tbc'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.frp_travel_direction AS ENUM ('arrival','departure'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.frp_can_edit(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['superadmin','dpa','fleet_master','captain','hod','purser']::app_role[])
    OR public.user_has_module_access(_user_id, 'crew', 'edit')
    OR public.user_has_module_access(_user_id, 'crew', 'admin');
$$;

CREATE TABLE IF NOT EXISTS public.frp_planner_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  department TEXT, position_title TEXT,
  lane_label TEXT NOT NULL, lane_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frp_lanes_vessel ON public.frp_planner_lanes(vessel_id);
CREATE INDEX IF NOT EXISTS idx_frp_lanes_company ON public.frp_planner_lanes(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frp_planner_lanes TO authenticated;
GRANT ALL ON public.frp_planner_lanes TO service_role;
ALTER TABLE public.frp_planner_lanes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frp_lanes_select" ON public.frp_planner_lanes FOR SELECT TO authenticated USING (company_id = public.current_user_company_id());
CREATE POLICY "frp_lanes_write" ON public.frp_planner_lanes FOR ALL TO authenticated
  USING (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()))
  WITH CHECK (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.frp_vessel_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  location_name TEXT NOT NULL,
  location_status public.frp_location_status NOT NULL DEFAULT 'confirmed',
  notes TEXT, colour TEXT, source_import_id UUID,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frp_loc_vessel_range ON public.frp_vessel_locations(vessel_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_frp_loc_company ON public.frp_vessel_locations(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frp_vessel_locations TO authenticated;
GRANT ALL ON public.frp_vessel_locations TO service_role;
ALTER TABLE public.frp_vessel_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frp_loc_select" ON public.frp_vessel_locations FOR SELECT TO authenticated USING (company_id = public.current_user_company_id());
CREATE POLICY "frp_loc_write" ON public.frp_vessel_locations FOR ALL TO authenticated
  USING (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()))
  WITH CHECK (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.frp_travel_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  crew_user_id UUID, crew_name_raw TEXT,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  direction public.frp_travel_direction NOT NULL,
  flight_datetime TIMESTAMPTZ, flight_number TEXT,
  changeover_date DATE, accommodation TEXT, route TEXT,
  flight_supplier TEXT, transfer_details TEXT,
  travel_letter_status TEXT, process_complete BOOLEAN NOT NULL DEFAULT false,
  pdf_link TEXT, notes TEXT, source_import_id UUID,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frp_travel_company ON public.frp_travel_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_frp_travel_crew ON public.frp_travel_movements(crew_user_id);
CREATE INDEX IF NOT EXISTS idx_frp_travel_vessel_date ON public.frp_travel_movements(vessel_id, changeover_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frp_travel_movements TO authenticated;
GRANT ALL ON public.frp_travel_movements TO service_role;
ALTER TABLE public.frp_travel_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frp_travel_select" ON public.frp_travel_movements FOR SELECT TO authenticated USING (company_id = public.current_user_company_id());
CREATE POLICY "frp_travel_write" ON public.frp_travel_movements FOR ALL TO authenticated
  USING (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()))
  WITH CHECK (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.frp_payroll_vessel_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  crew_user_id UUID, crew_name_raw TEXT, position_title TEXT,
  from_vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  to_vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  onboarding_transfer_date DATE, payroll_transfer_date DATE, travel_date DATE,
  status TEXT, notes TEXT, source_import_id UUID,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frp_payroll_company ON public.frp_payroll_vessel_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_frp_payroll_crew ON public.frp_payroll_vessel_transfers(crew_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frp_payroll_vessel_transfers TO authenticated;
GRANT ALL ON public.frp_payroll_vessel_transfers TO service_role;
ALTER TABLE public.frp_payroll_vessel_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frp_payroll_select" ON public.frp_payroll_vessel_transfers FOR SELECT TO authenticated USING (company_id = public.current_user_company_id());
CREATE POLICY "frp_payroll_write" ON public.frp_payroll_vessel_transfers FOR ALL TO authenticated
  USING (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()))
  WITH CHECK (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.frp_rotation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  lane_id UUID REFERENCES public.frp_planner_lanes(id) ON DELETE SET NULL,
  crew_user_id UUID, crew_name_raw TEXT,
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  label TEXT,
  rotation_type public.frp_rotation_type NOT NULL DEFAULT 'onboard',
  status public.frp_assignment_status NOT NULL DEFAULT 'draft',
  colour TEXT, notes TEXT,
  linked_leave_entry_id UUID,
  linked_travel_movement_id UUID REFERENCES public.frp_travel_movements(id) ON DELETE SET NULL,
  linked_payroll_transfer_id UUID REFERENCES public.frp_payroll_vessel_transfers(id) ON DELETE SET NULL,
  source_import_id UUID, version INT NOT NULL DEFAULT 1,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frp_rot_company ON public.frp_rotation_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_frp_rot_vessel_range ON public.frp_rotation_assignments(vessel_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_frp_rot_lane ON public.frp_rotation_assignments(lane_id);
CREATE INDEX IF NOT EXISTS idx_frp_rot_crew ON public.frp_rotation_assignments(crew_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frp_rotation_assignments TO authenticated;
GRANT ALL ON public.frp_rotation_assignments TO service_role;
ALTER TABLE public.frp_rotation_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frp_rot_select" ON public.frp_rotation_assignments FOR SELECT TO authenticated USING (company_id = public.current_user_company_id());
CREATE POLICY "frp_rot_write" ON public.frp_rotation_assignments FOR ALL TO authenticated
  USING (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()))
  WITH CHECK (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.frp_planner_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  entity_type TEXT NOT NULL, entity_id UUID NOT NULL, action TEXT NOT NULL,
  old_value JSONB, new_value JSONB,
  changed_by UUID, changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frp_audit_entity ON public.frp_planner_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_frp_audit_company ON public.frp_planner_audit_log(company_id);
GRANT SELECT, INSERT ON public.frp_planner_audit_log TO authenticated;
GRANT ALL ON public.frp_planner_audit_log TO service_role;
ALTER TABLE public.frp_planner_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frp_audit_select" ON public.frp_planner_audit_log FOR SELECT TO authenticated USING (company_id = public.current_user_company_id());
CREATE POLICY "frp_audit_insert" ON public.frp_planner_audit_log FOR INSERT TO authenticated WITH CHECK (company_id = public.current_user_company_id());

CREATE TABLE IF NOT EXISTS public.frp_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  filename TEXT NOT NULL,
  imported_by UUID, imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  summary JSONB, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frp_import_batches TO authenticated;
GRANT ALL ON public.frp_import_batches TO service_role;
ALTER TABLE public.frp_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frp_imp_select" ON public.frp_import_batches FOR SELECT TO authenticated USING (company_id = public.current_user_company_id());
CREATE POLICY "frp_imp_write" ON public.frp_import_batches FOR ALL TO authenticated
  USING (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()))
  WITH CHECK (company_id = public.current_user_company_id() AND public.frp_can_edit(auth.uid()));

CREATE OR REPLACE FUNCTION public.frp_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' THEN NEW.version = COALESCE(OLD.version,1) + 1; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_frp_lanes_upd ON public.frp_planner_lanes;
CREATE TRIGGER trg_frp_lanes_upd BEFORE UPDATE ON public.frp_planner_lanes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_frp_loc_upd ON public.frp_vessel_locations;
CREATE TRIGGER trg_frp_loc_upd BEFORE UPDATE ON public.frp_vessel_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_frp_travel_upd ON public.frp_travel_movements;
CREATE TRIGGER trg_frp_travel_upd BEFORE UPDATE ON public.frp_travel_movements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_frp_payroll_upd ON public.frp_payroll_vessel_transfers;
CREATE TRIGGER trg_frp_payroll_upd BEFORE UPDATE ON public.frp_payroll_vessel_transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_frp_rot_upd ON public.frp_rotation_assignments;
CREATE TRIGGER trg_frp_rot_upd BEFORE UPDATE ON public.frp_rotation_assignments FOR EACH ROW EXECUTE FUNCTION public.frp_bump_version();
DROP TRIGGER IF EXISTS trg_frp_imp_upd ON public.frp_import_batches;
CREATE TRIGGER trg_frp_imp_upd BEFORE UPDATE ON public.frp_import_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.frp_rotation_assignments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.frp_vessel_locations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.frp_travel_movements; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
