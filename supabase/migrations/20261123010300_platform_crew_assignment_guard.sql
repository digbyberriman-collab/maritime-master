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
-- crew assignments live (D-26). The legacy "HR managers can insert / update
-- crew assignments" policies let any HR editor (a legacy Master, a
-- user_roles captain or purser, RBAC hr edit) write a current assignment
-- for themselves on any vessel of the company, and so reach it. The
-- trigger narrows those policies (they stay: HR editors keep their crew
-- administration) for a signed-in caller without storm.access_engine:
--
--   a. self-placement (a row of your own that grants reach: an INSERT, a
--      changed user or vessel, is_current turning true) needs
--      admin.access.users_access.admin for the vessel's company and the
--      vessel (a fleet admin joining a vessel as crew)
--                                                   self_assignment_refused
--   b. the caller already reaches the new vessel (and, on UPDATE, the old
--      one), or holds fleet reach or users-access admin in its company
--                                                   assignment_vessel_out_of_reach
--   c. a changed user_id goes through the same checks (someone else's row
--      re-pointed to the caller is a self-placement)
--
-- The service role (no JWT: admin-actions reallocate_vessel,
-- create-crew-member, update-crew-assignment, parse-crew-csv), migrations
-- and this phase's definers are not limited. No legacy SECURITY DEFINER
-- function writes crew_assignments under a user session.
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
BEGIN
  IF v_uid IS NULL OR current_setting('storm.access_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;

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
    OR (v_company IS NOT NULL AND public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_company))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment_vessel_out_of_reach',
      DETAIL = 'You can only assign crew to a vessel you reach.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.vessel_id IS DISTINCT FROM NEW.vessel_id THEN
    SELECT v.company_id INTO v_old_company FROM public.vessels AS v WHERE v.id = OLD.vessel_id;
    IF NOT (
      public.reach_vessel_for(v_uid, OLD.vessel_id)
      OR (v_old_company IS NOT NULL AND public.fleet_reach_for(v_uid, v_old_company))
      OR (v_old_company IS NOT NULL AND public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_old_company))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment_vessel_out_of_reach',
        DETAIL = 'You can only move an assignment from a vessel you reach.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_assignments_guard ON public.crew_assignments;
CREATE TRIGGER trg_crew_assignments_guard
  BEFORE INSERT OR UPDATE ON public.crew_assignments
  FOR EACH ROW EXECUTE FUNCTION public.crew_assignments_guard();

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.crew_assignments_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.crew_assignments_guard() IS 'Trigger trg_crew_assignments_guard (no self-escalation): for a signed-in caller without storm.access_engine, an assignment of your own that grants reach needs users-access admin for the vessel (self_assignment_refused), and the caller must already reach the new (and old) vessel or hold fleet reach / users-access admin in its company (assignment_vessel_out_of_reach). Service role and migrations unaffected.';
