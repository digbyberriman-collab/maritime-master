-- =================================================================
-- HRIS PHASE 0: SUBSTRATE
-- =================================================================
-- 1. HR permission helper functions (RBAC + legacy role fallback)
-- 2. profiles: allow HR managers to update profiles in their company
--    (previously only self-update existed, so admin edits were no-ops)
-- 3. crew_assignments: role-gated writes with WITH CHECK
-- 4. crew_certificates / crew_attachments: role-gated writes
-- 5. hr_record_metadata: HR-only SELECT
-- 6. crew_change_dates: company-scoped SELECT (was any authenticated user)
-- 7. familiarization: trigger keeps completion_percentage / status /
--    actual_completion_date in sync with checklist items
-- =================================================================

-- ---------------------------------------------------------------
-- 1. HR permission helpers
-- ---------------------------------------------------------------
-- Legacy profiles.role (user_role enum) is still the only role many
-- accounts carry, so each helper checks RBAC first and falls back to it.

CREATE OR REPLACE FUNCTION public.legacy_profile_role(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.hr_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.user_has_module_access(_user_id, 'hr', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management');
$$;

CREATE OR REPLACE FUNCTION public.hr_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.hr_can_admin(_user_id)
    OR public.has_any_role(_user_id, ARRAY['fleet_master','captain','purser']::app_role[])
    OR public.user_has_module_access(_user_id, 'hr', 'edit')
    OR public.legacy_profile_role(_user_id) = 'master';
$$;

CREATE OR REPLACE FUNCTION public.hr_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.hr_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['chief_officer','chief_engineer','hod']::app_role[])
    OR public.legacy_profile_role(_user_id) IN ('chief_officer', 'chief_engineer');
$$;

COMMENT ON FUNCTION public.hr_can_view IS 'True for HR/management roles allowed to read HR records of other crew. Crew never pass this; self-service access is granted per table.';

-- ---------------------------------------------------------------
-- 2. profiles: HR managers can update profiles in their company
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "HR managers can update company profiles" ON public.profiles;
CREATE POLICY "HR managers can update company profiles"
  ON public.profiles FOR UPDATE
  USING (
    public.hr_can_edit(auth.uid())
    AND company_id IS NOT NULL
    AND company_id = public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    public.hr_can_edit(auth.uid())
    AND company_id IS NOT NULL
    AND company_id = public.get_user_company_id(auth.uid())
  );

-- ---------------------------------------------------------------
-- 3. crew_assignments: role-gated writes with WITH CHECK
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage crew assignments in their company" ON public.crew_assignments;
DROP POLICY IF EXISTS "HR managers can insert crew assignments" ON public.crew_assignments;
DROP POLICY IF EXISTS "HR managers can update crew assignments" ON public.crew_assignments;
DROP POLICY IF EXISTS "HR managers can delete crew assignments" ON public.crew_assignments;

CREATE POLICY "HR managers can insert crew assignments"
  ON public.crew_assignments FOR INSERT
  WITH CHECK (
    public.hr_can_edit(auth.uid())
    AND vessel_id IN (
      SELECT v.id FROM public.vessels v
      WHERE public.user_belongs_to_company(auth.uid(), v.company_id)
    )
  );

CREATE POLICY "HR managers can update crew assignments"
  ON public.crew_assignments FOR UPDATE
  USING (
    public.hr_can_edit(auth.uid())
    AND vessel_id IN (
      SELECT v.id FROM public.vessels v
      WHERE public.user_belongs_to_company(auth.uid(), v.company_id)
    )
  )
  WITH CHECK (
    public.hr_can_edit(auth.uid())
    AND vessel_id IN (
      SELECT v.id FROM public.vessels v
      WHERE public.user_belongs_to_company(auth.uid(), v.company_id)
    )
  );

CREATE POLICY "HR managers can delete crew assignments"
  ON public.crew_assignments FOR DELETE
  USING (
    public.hr_can_edit(auth.uid())
    AND vessel_id IN (
      SELECT v.id FROM public.vessels v
      WHERE public.user_belongs_to_company(auth.uid(), v.company_id)
    )
  );

-- ---------------------------------------------------------------
-- 4. crew_certificates / crew_attachments: role-gated writes
--    (subject may manage their own records; HR editors may manage
--    anyone in the company)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_can_write_crew_record(_subject_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _subject_user_id = auth.uid()
    OR (
      public.hr_can_edit(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = _subject_user_id
          AND public.user_belongs_to_company(auth.uid(), p.company_id)
      )
    );
$$;

DROP POLICY IF EXISTS "Users can insert crew certificates in their company" ON public.crew_certificates;
DROP POLICY IF EXISTS "Users can update crew certificates in their company" ON public.crew_certificates;
DROP POLICY IF EXISTS "Users can delete crew certificates in their company" ON public.crew_certificates;
DROP POLICY IF EXISTS "Crew or HR can insert crew certificates" ON public.crew_certificates;
DROP POLICY IF EXISTS "Crew or HR can update crew certificates" ON public.crew_certificates;
DROP POLICY IF EXISTS "Crew or HR can delete crew certificates" ON public.crew_certificates;

CREATE POLICY "Crew or HR can insert crew certificates"
  ON public.crew_certificates FOR INSERT
  WITH CHECK (public.hr_can_write_crew_record(user_id));
CREATE POLICY "Crew or HR can update crew certificates"
  ON public.crew_certificates FOR UPDATE
  USING (public.hr_can_write_crew_record(user_id))
  WITH CHECK (public.hr_can_write_crew_record(user_id));
CREATE POLICY "Crew or HR can delete crew certificates"
  ON public.crew_certificates FOR DELETE
  USING (public.hr_can_write_crew_record(user_id));

DROP POLICY IF EXISTS "Users can insert crew attachments in their company" ON public.crew_attachments;
DROP POLICY IF EXISTS "Users can update crew attachments in their company" ON public.crew_attachments;
DROP POLICY IF EXISTS "Users can delete crew attachments in their company" ON public.crew_attachments;
DROP POLICY IF EXISTS "Crew or HR can insert crew attachments" ON public.crew_attachments;
DROP POLICY IF EXISTS "Crew or HR can update crew attachments" ON public.crew_attachments;
DROP POLICY IF EXISTS "Crew or HR can delete crew attachments" ON public.crew_attachments;

CREATE POLICY "Crew or HR can insert crew attachments"
  ON public.crew_attachments FOR INSERT
  WITH CHECK (public.hr_can_write_crew_record(user_id));
CREATE POLICY "Crew or HR can update crew attachments"
  ON public.crew_attachments FOR UPDATE
  USING (public.hr_can_write_crew_record(user_id))
  WITH CHECK (public.hr_can_write_crew_record(user_id));
CREATE POLICY "Crew or HR can delete crew attachments"
  ON public.crew_attachments FOR DELETE
  USING (public.hr_can_write_crew_record(user_id));

-- ---------------------------------------------------------------
-- 5. hr_record_metadata: HR-only SELECT (subject may see own rows)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their company HR metadata" ON public.hr_record_metadata;
DROP POLICY IF EXISTS "HR staff can view company HR metadata" ON public.hr_record_metadata;
CREATE POLICY "HR staff can view company HR metadata"
  ON public.hr_record_metadata FOR SELECT
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_view(auth.uid()) OR user_id = auth.uid())
  );

-- ---------------------------------------------------------------
-- 6. crew_change_dates: company-scoped SELECT
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "crew_change_dates_select" ON public.crew_change_dates;
CREATE POLICY "crew_change_dates_select" ON public.crew_change_dates
  FOR SELECT USING (
    vessel_id IN (
      SELECT v.id FROM public.vessels v
      WHERE public.user_belongs_to_company(auth.uid(), v.company_id)
    )
  );

-- ---------------------------------------------------------------
-- 7. familiarization: keep parent record in sync with checklist
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_familiarization_progress()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fam_id uuid;
  v_total integer;
  v_done integer;
  v_pct integer;
  v_target date;
  v_status text;
BEGIN
  v_fam_id := COALESCE(NEW.familiarization_id, OLD.familiarization_id);
  IF v_fam_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE completed)
    INTO v_total, v_done
  FROM public.familiarization_checklist_items
  WHERE familiarization_id = v_fam_id;

  v_pct := CASE WHEN v_total = 0 THEN 0 ELSE ROUND((v_done::numeric / v_total) * 100)::integer END;

  SELECT target_completion_date INTO v_target
  FROM public.familiarization_records WHERE id = v_fam_id;

  IF v_total > 0 AND v_pct = 100 THEN
    v_status := 'Completed';
  ELSIF v_target IS NOT NULL AND v_target < CURRENT_DATE THEN
    v_status := 'Overdue';
  ELSIF v_pct > 0 THEN
    v_status := 'In_Progress';
  ELSE
    v_status := 'Not_Started';
  END IF;

  UPDATE public.familiarization_records
  SET completion_percentage = v_pct,
      status = v_status,
      actual_completion_date = CASE
        WHEN v_status = 'Completed' THEN COALESCE(actual_completion_date, CURRENT_DATE)
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = v_fam_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_familiarization_progress ON public.familiarization_checklist_items;
CREATE TRIGGER trg_recompute_familiarization_progress
  AFTER INSERT OR UPDATE OF completed OR DELETE ON public.familiarization_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.recompute_familiarization_progress();
