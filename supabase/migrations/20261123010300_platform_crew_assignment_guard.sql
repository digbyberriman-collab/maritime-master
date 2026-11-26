-- =================================================================
-- PLATFORM P3 follow-up: no self-placement through crew_assignments
-- (Phase 2 security rules: no self-escalation; spec rule 7; proposed D-125;
-- gap/04 T-96)
-- Tables: none new. Trigger: trg_crew_assignments_guard
--   (crew_assignments_guard()); crew_assignments_end_stale() (service
--   role: the daily sweep of rows whose leave date has come; D-217)
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
--   f. the Master office starts at the join date (D-227; review round 6,
--      master-office-via-join-date, D-237): on an UPDATE of a row that is a
--      current Master / Captain row before or after the change, a changed
--      effective join date, coalesce(join_date, start_date) (the legacy
--      normaliser fills join_date from start_date), moves the office (a
--      relief Master's join date brought forward makes them Master today;
--      the sitting Master's pushed out ends their office), so it needs
--      users-access admin for the vessel too, the caller's own row
--      included. Ended Master rows (history) and non-Master rows stay open
--      to HR editors. The Master-row notion stays crew_assignment_is_current
--      (not crew_assignment_holds_office): appointing a planned Master
--      with a future join date already needs admin under rule e.
--                                                   master_office_change_refused
--   g. the Master office ends at the leave date, else the end date (D-217,
--      D-227; review round 7, master-office-end-date-edit-unguarded,
--      D-244): on an UPDATE of a row that is a current Master / Captain
--      row before or after the change, a changed effective office end,
--      coalesce(NEW.leave_date, NEW.end_date) (what
--      crew_assignment_is_current / crew_assignment_holds_office read), or
--      a changed mirror, coalesce(NEW.end_date, NEW.leave_date) (the
--      legacy normaliser fills each from the other, so a stored end_date
--      becomes the office end once leave_date is cleared), needs
--      users-access admin for the vessel, the caller's own row included: a
--      future date on the sitting Master, an admin-set date cleared or
--      pushed out, a relief Master ended before their join date, end_date
--      set alone. Clearing only one of the two while the other stays set
--      is no change (the normaliser refills it from the other). Ended
--      Master rows (history) and non-Master rows stay open to HR editors;
--      no-JWT callers, the service role and storm.access_engine stay
--      exempt (crew_assignments_end_stale, hr-daily-sweeper).
--                                                   master_office_change_refused
--   h. a crew assignment names a member of the vessel's company (review
--      round 7, crew-assignment-foreign-company-user, D-246): an INSERT, a
--      changed user or vessel, or a revived row (exactly the rows that
--      grant reach, v_grants_reach) needs NEW.user_id's profile in the
--      vessel's company. profiles.company_id only, not
--      user_belongs_to_company() (HR records history for disabled users);
--      a missing profile or a NULL company is refused (fail closed). The
--      HR, payroll and gratuity definers read crew_assignments without RLS
--      and trust these rows, so another tenant must never write them.
--      Checked before a and b, so a foreign target always gets this
--      message. Plain date and notes edits of existing rows stay open (HR
--      corrects the history of a person who has since changed company).
--                                                   assignment_user_out_of_company
--
-- Rows planted before rule h (review round 7, D-246) stay in place: the
-- victim tenant can neither see nor remove them. The owner runs the
-- read-only listing under ledger check query V once (crew_assignments JOIN
-- vessels LEFT JOIN profiles on user_id WHERE p.company_id IS DISTINCT
-- FROM v.company_id), reviews each row and removes a confirmed plant with
-- the service role. There is no automatic delete: a company transfer
-- leaves legitimate rows of that shape.
--
-- The row as stored (review round 4, master-guard-bypass-via-leave-date):
-- BEFORE triggers fire in name order, so this guard runs before the legacy
-- trg_crew_assignments_normalise_dates (20260917110000), which copies
-- end_date and leave_date into each other and sets is_current false once
-- the leave date has come. The guard decides on the row as it will be
-- stored: v_new_current is the normaliser's is_current,
-- crew_assignment_is_current(NEW.is_current, NEW.leave_date, NEW.end_date)
-- (D-217: is_current AND NOT coalesce(leave_date, end_date) <=
-- current_date), used for the Master office after the change and for
-- "is_current turns true" in rule a. So ending a Master row through
-- leave_date or end_date is a Master office change (e), and an
-- already-ended Master row (an INSERT of history) is not an appointment.
-- The OLD row is read the same way (review round 5,
-- stale-is-current-keeps-reach): a row whose leave date passed after it
-- was written still says is_current, but it is not current, so updating
-- or deleting it is no Master office change.
--
-- crew_assignments_end_stale() (service role; a daily sweep, e.g.
-- hr-daily-sweeper): is_current = false on every row whose leave date
-- (else end date) has come, so the legacy readers that filter
-- .eq('is_current', true) stop seeing stale rows too.
-- The guard stays BEFORE on purpose: in an AFTER trigger the caller's own
-- new or moved row would already count toward reach_vessel_for() and the
-- vessel-scoped users_access.admin capability (reach-based), so rules a
-- and b would pass a self-placement onto a vessel the caller did not reach.
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
     OR to_regprocedure('public.crew_assignment_is_current(boolean,date,date)') IS NULL
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
  v_new_current boolean;
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
    IF public.crew_assignment_is_current(OLD.is_current, OLD.leave_date, OLD.end_date)
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

  -- The row as stored (review round 4): the legacy normaliser
  -- (trg_crew_assignments_normalise_dates, which fires after this guard)
  -- takes leave_date, else end_date, and ends the row once that date has
  -- come. Decide on that is_current, never on the one the caller sent:
  -- crew_assignment_is_current() (D-217), for OLD as well (review round 5):
  -- a stale row whose leave date already passed is no longer current, so
  -- touching it is no office change and no new reach.
  v_new_current := public.crew_assignment_is_current(NEW.is_current, NEW.leave_date, NEW.end_date);

  -- a / c. A row of your own that grants reach.
  v_grants_reach := TG_OP = 'INSERT'
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
    OR (v_new_current AND NOT public.crew_assignment_is_current(OLD.is_current, OLD.leave_date, OLD.end_date));

  -- h. The assignment names a member of the vessel's company (D-246;
  -- review round 7, crew-assignment-foreign-company-user), on exactly the
  -- rows that grant reach, before rules a and b. profiles.company_id only
  -- (HR records history for disabled users); a missing profile or a NULL
  -- company is refused.
  IF v_grants_reach AND NOT (v_company IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = NEW.user_id AND p.company_id = v_company)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assignment_user_out_of_company',
      DETAIL = 'A crew assignment can only name a member of the vessel''s company.';
  END IF;

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
    v_master_before := public.crew_assignment_is_current(OLD.is_current, OLD.leave_date, OLD.end_date)
      AND (coalesce(v_old_pos IN ('master', 'captain'), false) OR coalesce(v_old_rank IN ('master', 'captain'), false));
  END IF;
  v_master_after := v_new_current
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
  -- f. A join-date (else start-date) change on a current Master / Captain
  -- row moves the office (D-227, D-237).
  IF TG_OP = 'UPDATE' AND (v_master_before OR v_master_after)
     AND coalesce(NEW.join_date, NEW.start_date) IS DISTINCT FROM coalesce(OLD.join_date, OLD.start_date)
     AND NOT v_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'master_office_change_refused',
      DETAIL = 'Only a users-access administrator of the vessel can appoint or remove a Master.';
  END IF;
  -- g. The office ends at the leave date, else the end date (D-217, D-227,
  -- D-244; review round 7): a changed effective end on a current Master /
  -- Captain row (before or after), or a changed mirror (the normaliser
  -- turns a stored end_date into the office end once leave_date is
  -- cleared), the caller's own row included. Clearing one of the two
  -- while the other stays set is no change.
  IF TG_OP = 'UPDATE' AND (v_master_before OR v_master_after)
     AND (coalesce(NEW.leave_date, NEW.end_date) IS DISTINCT FROM coalesce(OLD.leave_date, OLD.end_date)
          OR coalesce(NEW.end_date, NEW.leave_date) IS DISTINCT FROM coalesce(OLD.end_date, OLD.leave_date))
     AND NOT v_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'master_office_change_refused',
      DETAIL = 'Only a users-access administrator of the vessel can appoint or remove a Master.';
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

-- ---------------------------------------------------------------- crew_assignments_end_stale() (service role)

-- The daily sweep (D-217; review round 5, stale-is-current-keeps-reach):
-- is_current = false on every row that still says current although its
-- leave date (else end date) has come; returns how many rows it ended.
-- Service role only, and never under a JWT (42501): the guard exempts
-- no-JWT callers, so the sweep passes it, and the legacy normaliser agrees
-- with the write. The build-out readers already ignore such rows
-- (crew_assignment_is_current()); this keeps the stored flag honest for the
-- legacy readers.
CREATE OR REPLACE FUNCTION public.crew_assignments_end_stale()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_only',
      DETAIL = 'crew_assignments_end_stale runs without a user session (the daily sweep).';
  END IF;
  UPDATE public.crew_assignments
  SET is_current = false
  WHERE is_current AND coalesce(leave_date, end_date) <= current_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_assignments_guard ON public.crew_assignments;
CREATE TRIGGER trg_crew_assignments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.crew_assignments
  FOR EACH ROW EXECUTE FUNCTION public.crew_assignments_guard();

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.crew_assignments_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_assignments_end_stale() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_assignments_end_stale() TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.crew_assignments_guard() IS 'Trigger trg_crew_assignments_guard (no self-escalation): decides on the row as stored (review round 4: is_current as the legacy date normaliser leaves it, so ending a Master row through leave_date or end_date is a Master office change; review round 5: OLD by crew_assignment_is_current() too, D-217, so touching a stale Master row is no office change); for a signed-in caller without storm.access_engine, an assignment of your own that grants reach needs users-access admin for the vessel (self_assignment_refused); the caller must already reach the new (and old) vessel or hold fleet reach / users-access admin for it (assignment_vessel_out_of_reach); an own-row change of the normalised position or rank needs users-access admin for the vessel (self_office_change_refused); appointing, removing or moving a Master / Captain row needs users-access admin for the vessel (and the old one on a move) (master_office_change_refused), and so does changing the effective join date, coalesce(join_date, start_date), of a row that is a current Master / Captain row before or after the update, your own included (review round 6, D-237: the office starts at the join date, D-227) (master_office_change_refused), and so does changing the office end, coalesce(leave_date, end_date), or its mirror coalesce(end_date, leave_date), of such a row, your own included (review round 7, D-244: a future date on the sitting Master, an admin-set date cleared or pushed out, a relief ended before it starts; clearing one of the two while the other stays set is no change) (master_office_change_refused); an INSERT, a changed user or vessel, or a revived row must name a user whose profile company is the vessel''s company, checked before the reach rules (review round 7, D-246; a missing profile or a NULL company refused; plain date and notes edits stay open) (assignment_user_out_of_company). DELETE (review round 3): the caller must reach the row''s vessel or hold fleet reach / users-access admin for it (assignment_vessel_out_of_reach), and deleting a current Master / Captain row needs users-access admin for the vessel (master_office_change_refused); an FK cascade of a vessel or profile delete passes. Service role, migrations and the engine definers unaffected.';
COMMENT ON FUNCTION public.crew_assignments_end_stale() IS 'D-217 daily sweep (service role only; 42501 under a JWT): is_current = false on every crew_assignments row whose coalesce(leave_date, end_date) has come; returns the number of rows ended. hr-daily-sweeper calls it.';
