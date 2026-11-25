-- =================================================================
-- PLATFORM P3 follow-up: no self-placement through crew_assignments
-- (Phase 2 security rules: no self-escalation; spec rule 7; proposed D-125;
-- gap/04 T-96)
-- Tables: none new. Trigger: trg_crew_assignments_guard
--   (crew_assignments_guard())
-- TS mirror: none (the legacy writers keep their API; a refusal is a 42501
--   with a stable MESSAGE)
-- =================================================================
--
-- Vessel reach, the reach-based capabilities, the records storage paths,
-- record_is_master and the notification audiences all read the current
-- crew assignments live (D-26), and the signature offices (record_is_master,
-- record_slot_eligible; D-132 interim) read their position and rank. The
-- legacy "HR managers can insert / update crew assignments" policies let
-- any HR editor (a legacy Master, a user_roles captain or purser, RBAC hr
-- edit) write a current assignment for themselves on any vessel of the
-- company, and so reach it, or retitle a row as Master. The trigger
-- narrows those policies (they stay: HR editors keep their crew
-- administration) for a signed-in caller without storm.access_engine:
--
--   a. self-placement (a row of your own that grants reach: an INSERT, a
--      changed user or vessel, is_current turning true) needs
--      admin.access.users_access.admin for the vessel's company and the
--      vessel (a fleet admin joining a vessel as crew)
--                                                   self_assignment_refused
--   b. the caller already reaches the new vessel (and, on UPDATE, the old
--      one; on DELETE, the row's vessel), or holds fleet reach or
--      users-access admin in its company for that vessel
--                                                   assignment_vessel_out_of_reach
--   c. a changed user_id goes through the same checks (someone else's row
--      re-pointed to the caller is a self-placement)
--   d. an own-row UPDATE whose normalised position or rank changes (any
--      office can become a signature slot office) needs users-access admin
--      for the company and the vessel
--                                                   self_office_change_refused
--   e. the Master office (a current row whose normalised position or rank
--      is master or captain): a row that becomes or stops being a Master
--      row, or a Master row whose user or vessel changes (a revived ended
--      Master row and an INSERT of one included), and a DELETE of a current
--      Master row, needs users-access admin for the company and the vessel
--      (and the old vessel on a move)
--                                                   master_office_change_refused
--
-- DELETE (review round 3, crew-assignment-delete-unguarded; the legacy
-- "HR managers can delete crew assignments" policy admits every vessel an
-- HR viewer sees, i.e. every company vessel): rules b and e apply to the
-- removed row. An FK cascade from a vessels or profiles delete (which RLS
-- already checked) finds the parent row gone and passes: an assignment
-- row cannot exist without both parents otherwise.
--
-- The normalisation is the same ASCII translate / regexp as
-- record_normalise_office() (20261123020100, applied later), inlined here.
-- The service role (no JWT: admin-actions reallocate_vessel,
-- create-crew-member), migrations and this phase's definers
-- (fulfil_imported_assignment) are not limited. No legacy SECURITY
-- DEFINER function writes crew_assignments under a user session.
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.crew_assignments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010300_platform_crew_assignment_guard needs public.crew_assignments';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010300_platform_crew_assignment_guard needs the reach and capability helpers: apply 20261123000300 and 20261123000400 first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- trg_crew_assignments_guard

CREATE OR REPLACE FUNCTION public.crew_assignments_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_old_company uuid;
  v_grants_reach boolean;
  v_new_pos text;
  v_new_rank text;
  v_old_pos text;
  v_old_rank text;
  v_master_before boolean := false;
  v_master_after boolean;
  v_admin boolean;
BEGIN
  IF v_uid IS NULL OR current_setting('storm.access_engine', true) = 'on' THEN
    -- NEW is NULL on a DELETE: returning it would cancel the delete.
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE (review round 3, crew-assignment-delete-unguarded): rules b and
  -- e apply to removing a row too.
  IF TG_OP = 'DELETE' THEN
    SELECT v.company_id INTO v_old_company FROM public.vessels AS v WHERE v.id = OLD.vessel_id;
    -- An FK cascade of an RLS-checked vessels / profiles delete: the parent
    -- row is already gone (a row cannot exist without it otherwise).
    IF v_old_company IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = OLD.user_id) THEN
      RETURN OLD;
    END IF;
    -- b. The caller reaches the vessel, or holds fleet reach / users-access
    -- admin there.
    IF NOT (public.reach_vessel_for(v_uid, OLD.vessel_id)
            OR public.fleet_reach_for(v_uid, v_old_company)
            OR public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_old_company, OLD.vessel_id)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment_vessel_out_of_reach',
        DETAIL = 'You can only remove an assignment from a vessel you reach.';
    END IF;
    -- e. Removing a current Master / Captain row.
    v_old_pos := nullif(btrim(regexp_replace(translate(btrim(coalesce(OLD.position, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_'), '');
    v_old_rank := nullif(btrim(regexp_replace(translate(btrim(coalesce(OLD.rank, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_'), '');
    IF coalesce(OLD.is_current, false)
       AND (coalesce(v_old_pos IN ('master', 'captain'), false) OR coalesce(v_old_rank IN ('master', 'captain'), false))
       AND NOT public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_old_company, OLD.vessel_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'master_office_change_refused',
        DETAIL = 'Only a users-access administrator of the vessel can appoint or remove a Master.';
    END IF;
    RETURN OLD;
  END IF;

  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT v.company_id INTO v_old_company FROM public.vessels AS v WHERE v.id = OLD.vessel_id;
  END IF;

  -- a / c. A row of your own that grants reach.
  v_grants_reach := TG_OP = 'INSERT'
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
    OR (coalesce(NEW.is_current, false) AND NOT coalesce(OLD.is_current, false));
  IF NEW.user_id = v_uid AND v_grants_reach
     AND NOT (v_company IS NOT NULL AND public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_company, NEW.vessel_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'self_assignment_refused',
      DETAIL = 'Only a users-access administrator can place themselves on a vessel.';
  END IF;

  -- b. The caller already reaches the vessel, or administers the fleet.
  IF NOT (
    public.reach_vessel_for(v_uid, NEW.vessel_id)
    OR (v_company IS NOT NULL AND public.fleet_reach_for(v_uid, v_company))
    OR (v_company IS NOT NULL AND public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_company, NEW.vessel_id))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment_vessel_out_of_reach',
      DETAIL = 'You can only assign crew to a vessel you reach.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.vessel_id IS DISTINCT FROM NEW.vessel_id THEN
    IF NOT (
      public.reach_vessel_for(v_uid, OLD.vessel_id)
      OR (v_old_company IS NOT NULL AND public.fleet_reach_for(v_uid, v_old_company))
      OR (v_old_company IS NOT NULL AND public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_old_company, OLD.vessel_id))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment_vessel_out_of_reach',
        DETAIL = 'You can only move an assignment from a vessel you reach.';
    END IF;
  END IF;

  -- d / e. Offices (normalised as record_normalise_office does).
  v_new_pos := nullif(btrim(regexp_replace(translate(btrim(coalesce(NEW.position, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_'), '');
  v_new_rank := nullif(btrim(regexp_replace(translate(btrim(coalesce(NEW.rank, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_'), '');
  IF TG_OP = 'UPDATE' THEN
    v_old_pos := nullif(btrim(regexp_replace(translate(btrim(coalesce(OLD.position, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_'), '');
    v_old_rank := nullif(btrim(regexp_replace(translate(btrim(coalesce(OLD.rank, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_'), '');
    v_master_before := coalesce(OLD.is_current, false)
      AND (coalesce(v_old_pos IN ('master', 'captain'), false) OR coalesce(v_old_rank IN ('master', 'captain'), false));
  END IF;
  v_master_after := coalesce(NEW.is_current, false)
    AND (coalesce(v_new_pos IN ('master', 'captain'), false) OR coalesce(v_new_rank IN ('master', 'captain'), false));
  v_admin := v_company IS NOT NULL
    AND public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_company, NEW.vessel_id)
    AND (TG_OP = 'INSERT' OR OLD.vessel_id IS NOT DISTINCT FROM NEW.vessel_id
         OR (v_old_company IS NOT NULL AND public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_old_company, OLD.vessel_id)));

  IF TG_OP = 'UPDATE' AND (NEW.user_id = v_uid OR OLD.user_id = v_uid)
     AND (v_new_pos IS DISTINCT FROM v_old_pos OR v_new_rank IS DISTINCT FROM v_old_rank)
     AND NOT v_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'self_office_change_refused',
      DETAIL = 'Only a users-access administrator can change their own position or rank.';
  END IF;
  IF (v_master_before IS DISTINCT FROM v_master_after
      OR (v_master_after AND TG_OP = 'UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id)))
     AND NOT v_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'master_office_change_refused',
      DETAIL = 'Only a users-access administrator of the vessel can appoint or remove a Master.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_assignments_guard ON public.crew_assignments;
CREATE TRIGGER trg_crew_assignments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.crew_assignments
  FOR EACH ROW EXECUTE FUNCTION public.crew_assignments_guard();

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.crew_assignments_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.crew_assignments_guard() IS 'Trigger trg_crew_assignments_guard (no self-escalation): for a signed-in caller without storm.access_engine, an assignment of your own that grants reach needs users-access admin for the vessel (self_assignment_refused); the caller must already reach the new (and old) vessel or hold fleet reach / users-access admin for it (assignment_vessel_out_of_reach); an own-row change of the normalised position or rank needs users-access admin for the vessel (self_office_change_refused); appointing, removing or moving a Master / Captain row needs users-access admin for the vessel (and the old one on a move) (master_office_change_refused). DELETE (review round 3): the caller must reach the row''s vessel or hold fleet reach / users-access admin for it (assignment_vessel_out_of_reach), and deleting a current Master / Captain row needs users-access admin for the vessel (master_office_change_refused); an FK cascade of a vessel or profile delete passes. Service role, migrations and the engine definers unaffected.';
