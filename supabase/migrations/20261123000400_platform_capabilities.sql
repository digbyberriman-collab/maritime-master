-- =================================================================
-- PLATFORM P2/P3: the server capability check (gap/00 C6; gap/01 F23, F31,
-- F33, W10; DECISIONS D-04; Phase 2 spec §A.4, CC-5, CC-11, CC-14)
-- Tables: none new. Policies: account_memberships_select_admin,
--   account_membership_vessels_select_admin (users-access viewers read
--   their company's memberships)
-- Helpers: legacy_user_admin(), role_rank(), user_role_rank(),
--   has_capability(), has_capability_for(), user_company_for_admin(),
--   is_company_actor(), admin_scope_all(), admin_may_act_on_user()
--   (service role; definers), admin_may_view_user() (RLS predicate)
-- TS mirror: src/modules/auth/types/db.pending.ts (AuthPendingFunctions
--   has_capability / is_company_actor); the interim client adaptor useCan
--   and the edge fallback supabase/functions/_shared/capability.ts
--   (legacyCapability) apply the same legacy-admin rule
-- =================================================================
--
-- The server mirror of the interim useCan adaptor for the seven keys the
-- platform needs now; any other key is false. For a user u in company C:
--
--   full_admin(u)      legacy_user_admin(u), or a non-legacy membership of
--                      kind owner
--   ua_level(u)        'write' for a full admin; for a non-legacy admin
--                      membership its users_access_level; else 'none'
--   admin_scope_ok(u)  full admin, no vessel given, or the vessel is in
--                      u's reach (a non-legacy admin acts only on vessels
--                      they reach, gap/01 F23)
--
--   admin.access.users_access.view     ua_level read / write, scope ok
--   admin.access.users_access.assign   ua_level write and scope ok, or a
--                                      legacy master for a vessel they
--                                      reach (proposed D-125)
--   admin.access.users_access.admin    ua_level write, scope ok
--   admin.access.roles_permissions.admin  never for a tenant (global rows)
--   admin.access.permission_audit_log.view  full admin, a non-legacy DPA
--                                      membership, or the legacy dpa role
--   fleet.operations.vessels.view      fleet reach in C, or the vessel is
--                                      in reach
--   fleet.operations.vessels.admin     full admin, or a non-legacy admin
--                                      membership over all vessels
--
-- A user_roles dpa / superadmin row counts only when it names the user's
-- own company or no company (CC-5: a row naming another company never
-- makes anyone an admin anywhere).
--
-- Acting on a user (review round 2, D-120; gap/01 F23): admin_scope_all()
-- is a full admin or a non-legacy admin over all vessels of the company;
-- anyone else acts on a user only when every vessel of the target's
-- structural vessel set (membership vessel rows, current crew assignments,
-- else the profile's imported vessel, D-125; Sold and archived vessels
-- excluded; read whatever the target's active state) is in their own
-- reach, and never on a target with an empty set, vessel_scope all, fleet
-- access or legacy fleet reach (admin_may_act_on_user(), for definers;
-- admin_may_view_user(), the caller-scoped read predicate of the admin
-- read policies here and in files 8 and 9).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.account_memberships') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.reach_vessels_for(uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.legacy_fleet_reach(uuid)') IS NULL
     OR to_regprocedure('public.vessel_in_reachable_state(text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000400_platform_capabilities needs account_memberships, user_is_active(), the reach helpers and legacy_fleet_reach(): apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'imported_vessel_id') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000400_platform_capabilities needs the live profiles.imported_vessel_id';
  END IF;
  IF to_regclass('public.user_roles') IS NULL OR to_regprocedure('public.user_has_permission(uuid,text,public.permission_level,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000400_platform_capabilities needs public.user_roles and user_has_permission(uuid,text,permission_level,uuid)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- legacy admin and ranks

-- Today's admin rule (the adaptor's full access + RBAC settings admin, and
-- the admin-actions gate): an active user whose legacy profile role is dpa
-- or shore_management, or with an active, unexpired user_roles dpa /
-- superadmin row of their own company (or of no company), or an active,
-- in-date RBAC role superadmin / dpa, or RBAC settings admin.
CREATE OR REPLACE FUNCTION public.legacy_user_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND public.user_is_active(_user_id)
     AND (
       EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.role::text IN ('dpa', 'shore_management'))
       OR EXISTS (
         SELECT 1
         FROM public.user_roles AS ur
         JOIN public.profiles AS p ON p.user_id = ur.user_id
         WHERE ur.user_id = _user_id
           AND ur.is_active = true
           AND ur.role::text IN ('dpa', 'superadmin')
           AND (ur.expires_at IS NULL OR ur.expires_at > now())
           AND (ur.company_id IS NULL OR ur.company_id = p.company_id))
       OR EXISTS (
         SELECT 1
         FROM public.rbac_user_roles AS r
         JOIN public.roles AS ro ON ro.id = r.role_id
         WHERE r.user_id = _user_id
           AND r.is_active = true
           AND (r.valid_until IS NULL OR r.valid_until > now())
           AND ro.name IN ('superadmin', 'dpa'))
       OR public.user_has_permission(_user_id, 'settings', 'admin'::public.permission_level, NULL)
     )
$$;

-- Role ranks for the no-self-escalation rules of file 8 (an admin never
-- grants a role ranked above their own).
CREATE OR REPLACE FUNCTION public.role_rank(_role_name text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE _role_name
    WHEN 'superadmin' THEN 100
    WHEN 'dpa' THEN 90
    WHEN 'fleet_master' THEN 80
    WHEN 'captain' THEN 60
    WHEN 'purser' THEN 50
    WHEN 'chief_officer' THEN 50
    WHEN 'chief_engineer' THEN 50
    WHEN 'hod' THEN 40
    WHEN 'officer' THEN 30
    WHEN 'auditor' THEN 20
    WHEN 'employer_api' THEN 20
    WHEN 'crew' THEN 10
    ELSE 0
  END
$$;

-- The highest rank a user holds: active, in-date RBAC roles and the legacy
-- profile role (dpa 90, shore_management 80, master 60, chief officer /
-- chief engineer 50, crew 10). 0 for an inactive or unknown user.
CREATE OR REPLACE FUNCTION public.user_role_rank(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT public.user_is_active(_user_id) THEN 0 ELSE coalesce(greatest(
    (SELECT max(public.role_rank(ro.name))
       FROM public.rbac_user_roles AS r
       JOIN public.roles AS ro ON ro.id = r.role_id
      WHERE r.user_id = _user_id
        AND r.is_active = true
        AND (r.valid_until IS NULL OR r.valid_until > now())),
    (SELECT CASE p.role::text
              WHEN 'dpa' THEN 90
              WHEN 'shore_management' THEN 80
              WHEN 'master' THEN 60
              WHEN 'chief_officer' THEN 50
              WHEN 'chief_engineer' THEN 50
              WHEN 'crew' THEN 10
              ELSE 0
            END
       FROM public.profiles AS p
      WHERE p.user_id = _user_id)
  ), 0) END
$$;

-- ---------------------------------------------------------------- capabilities

-- The rules above for any user (definers and triggers: set_membership_status,
-- notification recipients, the profile guard). False when the user is NULL
-- or inactive, the company is NULL or not the user's profile company, the
-- vessel (when given) is not a vessel of that company, or the key is not
-- one of the seven.
CREATE OR REPLACE FUNCTION public.has_capability_for(_user_id uuid, p_key text, p_company_id uuid, p_vessel_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_role text;
  v_kind text;
  v_level text;
  v_scope text;
  v_is_dpa boolean;
  v_full boolean;
  v_ua text;
  v_scope_ok boolean;
BEGIN
  IF _user_id IS NULL OR p_company_id IS NULL OR p_key IS NULL THEN
    RETURN false;
  END IF;
  IF p_key NOT IN (
    'admin.access.users_access.view', 'admin.access.users_access.assign', 'admin.access.users_access.admin',
    'admin.access.roles_permissions.admin', 'admin.access.permission_audit_log.view',
    'fleet.operations.vessels.view', 'fleet.operations.vessels.admin'
  ) THEN
    RETURN false;
  END IF;
  IF NOT public.user_is_active(_user_id) THEN
    RETURN false;
  END IF;

  SELECT p.company_id, p.role::text INTO v_company, v_role FROM public.profiles AS p WHERE p.user_id = _user_id;
  IF v_company IS DISTINCT FROM p_company_id THEN
    RETURN false;
  END IF;
  IF p_vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = p_company_id) THEN
    RETURN false;
  END IF;
  IF p_key = 'admin.access.roles_permissions.admin' THEN
    RETURN false;  -- role definitions are global rows: platform only
  END IF;

  -- The non-legacy membership, active and in its window, if any.
  SELECT m.kind, m.users_access_level, m.vessel_scope, m.is_dpa
    INTO v_kind, v_level, v_scope, v_is_dpa
  FROM public.account_memberships AS m
  WHERE m.user_id = _user_id
    AND m.company_id = p_company_id
    AND NOT m.legacy_managed
    AND m.status = 'active'
    AND (m.valid_from IS NULL OR m.valid_from <= now())
    AND (m.valid_until IS NULL OR m.valid_until > now());

  v_full := public.legacy_user_admin(_user_id) OR coalesce(v_kind = 'owner', false);
  v_ua := CASE WHEN v_full THEN 'write' WHEN v_kind = 'admin' THEN v_level ELSE 'none' END;
  v_scope_ok := v_full OR p_vessel_id IS NULL OR public.reach_vessel_for(_user_id, p_vessel_id);

  RETURN coalesce(CASE p_key
    WHEN 'admin.access.users_access.view' THEN v_ua IN ('read', 'write') AND v_scope_ok
    WHEN 'admin.access.users_access.assign' THEN
      (v_ua = 'write' AND v_scope_ok)
      OR (v_role = 'master' AND p_vessel_id IS NOT NULL AND public.reach_vessel_for(_user_id, p_vessel_id))
    WHEN 'admin.access.users_access.admin' THEN v_ua = 'write' AND v_scope_ok
    WHEN 'admin.access.permission_audit_log.view' THEN v_full OR coalesce(v_is_dpa, false) OR v_role = 'dpa'
    WHEN 'fleet.operations.vessels.view' THEN
      public.fleet_reach_for(_user_id, p_company_id)
      OR (p_vessel_id IS NOT NULL AND public.reach_vessel_for(_user_id, p_vessel_id))
    WHEN 'fleet.operations.vessels.admin' THEN v_full OR (coalesce(v_kind = 'admin', false) AND v_scope = 'all')
    ELSE false
  END, false);
END;
$$;

-- The caller's capability (policies, RPCs, the edge assertCapability).
-- False without a caller.
CREATE OR REPLACE FUNCTION public.has_capability(p_key text, p_company_id uuid, p_vessel_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_capability_for(auth.uid(), p_key, p_company_id, p_vessel_id)
$$;

-- The target user's profile company, only when the (active) caller is in
-- that same company; always for the service role / no JWT. Unlike
-- get_user_company_id (which file 7 makes NULL for a disabled user) it
-- ignores the target's own state, so admins still see and fix a disabled
-- user's roles. Used by the rbac_user_roles policies of file 8.
CREATE OR REPLACE FUNCTION public.user_company_for_admin(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.company_id
  FROM public.profiles AS t
  WHERE t.user_id = _user_id
    AND t.company_id IS NOT NULL
    AND (
      auth.uid() IS NULL
      OR (EXISTS (SELECT 1 FROM public.profiles AS c WHERE c.user_id = auth.uid() AND c.company_id = t.company_id)
          AND public.user_is_active(auth.uid()))
    )
$$;

-- gap/01 W10 interim "is this user the company" for company-side record
-- steps: an active user whose company owns the vessel and who is a full
-- admin, or holds a non-legacy admin membership whose reach includes the
-- vessel. Shore staff and crew are never the company. Without a vessel (a
-- fleet record) the same without the reach part, in the user's profile
-- company. A signed-in caller asking about a user of another company gets
-- false (user_is_active() does not answer across companies).
CREATE OR REPLACE FUNCTION public.is_company_actor(_user_id uuid, _vessel_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF _user_id IS NULL OR NOT public.user_is_active(_user_id) THEN
    RETURN false;
  END IF;
  SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.user_id = _user_id;
  IF v_company IS NULL THEN
    RETURN false;
  END IF;
  IF _vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = _vessel_id AND v.company_id = v_company) THEN
    RETURN false;
  END IF;
  IF public.legacy_user_admin(_user_id) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.account_memberships AS m
    WHERE m.user_id = _user_id
      AND m.company_id = v_company
      AND NOT m.legacy_managed
      AND m.status = 'active'
      AND (m.valid_from IS NULL OR m.valid_from <= now())
      AND (m.valid_until IS NULL OR m.valid_until > now())
      AND (m.kind = 'owner'
           OR (m.kind = 'admin' AND (_vessel_id IS NULL OR public.reach_vessel_for(_user_id, _vessel_id))))
  );
END;
$$;

-- ---------------------------------------------------------------- acting on a user (gap/01 F23; review round 2)

-- Whether the actor administers every vessel of the company: an active
-- user whose profile is in _company and who is a full legacy admin
-- (legacy_user_admin), or holds a non-legacy owner membership, or a
-- non-legacy admin membership with vessel_scope all (active, in its
-- window) there. NULL / unknown / inactive -> false. Internal (service
-- role; definers).
CREATE OR REPLACE FUNCTION public.admin_scope_all(_actor uuid, _company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _actor IS NOT NULL
     AND _company IS NOT NULL
     AND public.user_is_active(_actor)
     AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _actor AND p.company_id = _company)
     AND (
       public.legacy_user_admin(_actor)
       OR EXISTS (
         SELECT 1
         FROM public.account_memberships AS m
         WHERE m.user_id = _actor
           AND m.company_id = _company
           AND NOT m.legacy_managed
           AND m.status = 'active'
           AND (m.valid_from IS NULL OR m.valid_from <= now())
           AND (m.valid_until IS NULL OR m.valid_until > now())
           AND (m.kind = 'owner' OR (m.kind = 'admin' AND m.vessel_scope = 'all')))
     )
$$;

-- Whether the actor may act on the target user (or the target profile,
-- which may have no login yet) in _company, vessel by vessel: true with
-- admin_scope_all(); otherwise only when the target's structural vessel
-- set is non-empty and every vessel in it is in reach_vessels_for(_actor).
-- The set is read whatever the target's active state (reach_vessels_for()
-- of a disabled user is empty, which would make the rule vacuous): the
-- target membership's account_membership_vessels rows (any window) plus
-- the target's current crew assignments, else the profile's
-- imported_vessel_id (D-125); Sold and archived vessels excluded. A target
-- with an empty set, a membership with vessel_scope all or fleet access,
-- or legacy fleet reach (a dpa / shore_management profile, an RBAC fleet
-- role) needs admin_scope_all(). The target is resolved from the user, or
-- from the profile when there is no user; it must belong to _company (its
-- profile there, or a membership there). Unknown ids, an inactive actor or
-- an actor outside _company -> false. Internal (service role; definers).
CREATE OR REPLACE FUNCTION public.admin_may_act_on_user(_actor uuid, _target_user uuid, _company uuid, _target_profile uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_membership public.account_memberships;
  v_user uuid;
  v_vessels uuid[];
BEGIN
  IF _actor IS NULL OR _company IS NULL OR (_target_user IS NULL AND _target_profile IS NULL) THEN
    RETURN false;
  END IF;
  IF NOT public.user_is_active(_actor)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS a WHERE a.user_id = _actor AND a.company_id = _company) THEN
    RETURN false;
  END IF;

  IF _target_user IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE user_id = _target_user;
  END IF;
  IF v_profile.id IS NULL AND _target_profile IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = _target_profile;
  END IF;
  v_user := coalesce(_target_user, v_profile.user_id);
  SELECT * INTO v_membership
  FROM public.account_memberships AS m
  WHERE m.company_id = _company
    AND ((v_user IS NOT NULL AND m.user_id = v_user) OR (v_profile.id IS NOT NULL AND m.profile_id = v_profile.id))
  ORDER BY (m.user_id IS NOT DISTINCT FROM v_user) DESC, m.created_at
  LIMIT 1;
  IF v_profile.id IS NULL AND v_membership.id IS NULL THEN
    RETURN false;  -- unknown target (fail closed)
  END IF;
  IF v_profile.company_id IS DISTINCT FROM _company AND v_membership.id IS NULL THEN
    RETURN false;  -- not a member of this company
  END IF;

  IF public.admin_scope_all(_actor, _company) THEN
    RETURN true;
  END IF;

  -- Everything below needs a current member of the company.
  IF v_profile.id IS NULL OR v_profile.company_id IS DISTINCT FROM _company THEN
    RETURN false;
  END IF;
  -- Fleet-wide targets need admin_scope_all().
  IF v_profile.role::text IN ('dpa', 'shore_management')
     OR (v_user IS NOT NULL AND public.legacy_fleet_reach(v_user))
     OR (v_membership.id IS NOT NULL AND NOT v_membership.legacy_managed
         AND (v_membership.vessel_scope = 'all' OR v_membership.fleet_access)) THEN
    RETURN false;
  END IF;

  v_vessels := ARRAY(
    SELECT v.id
    FROM public.vessels AS v
    WHERE v.company_id = _company
      AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
      AND (
        (v_membership.id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.account_membership_vessels AS mv
           WHERE mv.membership_id = v_membership.id AND mv.vessel_id = v.id))
        OR (v_user IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.crew_assignments AS ca
           WHERE ca.user_id = v_user AND ca.vessel_id = v.id AND ca.is_current))
      )
  );
  IF cardinality(v_vessels) = 0 AND v_profile.imported_vessel_id IS NOT NULL THEN
    v_vessels := ARRAY(
      SELECT v.id FROM public.vessels AS v
      WHERE v.id = v_profile.imported_vessel_id
        AND v.company_id = _company
        AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
    );
  END IF;
  IF cardinality(v_vessels) = 0 THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM unnest(v_vessels) AS t(vessel_id)
    WHERE t.vessel_id NOT IN (SELECT r FROM public.reach_vessels_for(_actor) AS r)
  );
END;
$$;

-- RLS predicate of the admin read policies (rule 11): the caller (active,
-- with admin.access.users_access.view in _company) may see this user's
-- access rows: admin_may_act_on_user(auth.uid(), ...). False without a
-- caller.
CREATE OR REPLACE FUNCTION public.admin_may_view_user(_target_user uuid, _company uuid, _target_profile uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_capability('admin.access.users_access.view', _company)
     AND public.admin_may_act_on_user(auth.uid(), _target_user, _company, _target_profile)
$$;

-- ---------------------------------------------------------------- admin read policies (file 3 has the own-row ones)

-- Users-access viewers of the company, for the users they may act on
-- (a vessel-scoped admin reads only the users of the vessels they reach).
DROP POLICY IF EXISTS account_memberships_select_admin ON public.account_memberships;
CREATE POLICY account_memberships_select_admin ON public.account_memberships
  FOR SELECT TO authenticated
  USING (public.admin_may_view_user(user_id, company_id, profile_id));

DROP POLICY IF EXISTS account_membership_vessels_select_admin ON public.account_membership_vessels;
CREATE POLICY account_membership_vessels_select_admin ON public.account_membership_vessels
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.account_memberships AS m
    WHERE m.id = account_membership_vessels.membership_id
      AND public.admin_may_view_user(m.user_id, m.company_id, m.profile_id)
  ));

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.legacy_user_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.role_rank(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_role_rank(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_capability_for(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_capability(text, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_company_for_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_company_actor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_scope_all(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_may_act_on_user(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_may_view_user(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.legacy_user_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.role_rank(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_role_rank(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_capability_for(uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_capability(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_company_for_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_actor(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_scope_all(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_may_act_on_user(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_may_view_user(uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.legacy_user_admin(uuid) IS 'Today''s admin rule for an active user: legacy role dpa / shore_management, a user_roles dpa / superadmin row of their own company or of no company (CC-5), an RBAC superadmin / dpa role, or RBAC settings admin. Internal (service role; definers). The edge fallback legacyCapability applies the same rule.';
COMMENT ON FUNCTION public.role_rank(text) IS 'Rank of a role name (superadmin 100 ... crew 10, anything else 0) for the no-self-escalation rules. Internal.';
COMMENT ON FUNCTION public.user_role_rank(uuid) IS 'The highest rank an active user holds (RBAC roles and the legacy profile role). Internal.';
COMMENT ON FUNCTION public.has_capability_for(uuid, text, uuid, uuid) IS 'The seven Phase 2 capability keys for any user in a company (and vessel); unknown key, inactive user, other company or foreign vessel: false. Service role only; definers call it.';
COMMENT ON FUNCTION public.has_capability(text, uuid, uuid) IS 'has_capability_for(auth.uid(), ...): the caller''s capability; false without a caller. Policies and RPCs use it.';
COMMENT ON FUNCTION public.user_company_for_admin(uuid) IS 'The target user''s company when the active caller is in it (service role: always); ignores the target''s own active state. Used by RBAC policies.';
COMMENT ON FUNCTION public.is_company_actor(uuid, uuid) IS 'gap/01 W10 interim: whether the user acts as the company for a vessel (or, with no vessel, a fleet record): full admin, or a non-legacy admin membership reaching the vessel. Never shore staff or crew.';
COMMENT ON FUNCTION public.admin_scope_all(uuid, uuid) IS 'gap/01 F23: the active actor (profile in the company) is a full legacy admin, or holds a non-legacy owner membership or a non-legacy admin membership with vessel_scope all there. Internal (service role; definers).';
COMMENT ON FUNCTION public.admin_may_act_on_user(uuid, uuid, uuid, uuid) IS 'gap/01 F23: whether the actor may act on the target user / profile of the company: admin_scope_all(), or every vessel of the target''s structural set (membership vessel rows, current crew assignments, else imported_vessel_id per D-125; Sold / archived excluded; whatever the target''s active state) is in the actor''s reach. Empty set, vessel_scope all, fleet access or legacy fleet reach need admin_scope_all(). Unknown ids, an inactive actor or another company: false. Internal (service role; definers).';
COMMENT ON FUNCTION public.admin_may_view_user(uuid, uuid, uuid) IS 'RLS predicate (rule 11) of the admin read policies on memberships, membership vessels, user_roles, rbac_user_roles, overrides and invitations: the caller has admin.access.users_access.view in the company and admin_may_act_on_user(auth.uid(), ...). False without a caller.';
