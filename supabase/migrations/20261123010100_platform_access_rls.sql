-- =================================================================
-- PLATFORM P3: vessel and access-control RLS (gap/01 F6, F53; gap/03 B10;
-- DECISIONS D-25; Phase 2 spec §A.8, CC-2, CC-4, CC-5; proposed D-124)
-- Tables: none new. Columns: user_permission_overrides.company_id /
--   vessel_id, permission_audit_log.company_id
-- Policies: vessels_select / insert / update / delete; roles and
--   role_permissions frozen to service_role; rbac_user_roles_*,
--   user_permission_overrides_*, user_roles_select_admin (user_roles is
--   written by the service role only), permission_audit_log_select
-- Helpers: rbac_user_roles_write_allowed(), permission_override_write_allowed(),
--   rbac_user_roles_stamp() (trigger)
--   (caller-scoped predicates for policies, rule 11); log_permission_change()
--   (live, exact signature, service role);
--   triggers trg_user_permission_overrides_stamp, trg_rbac_user_roles_stamp
--   (D-230: assigned_by / assigned_at stamped by the server) and the audit triggers
--   trg_rbac_user_roles_audit, trg_user_permission_overrides_audit,
--   trg_user_roles_audit
-- TS mirror: src/modules/auth/types/db.pending.ts (AuthPendingColumns
--   user_permission_overrides.company_id / vessel_id,
--   permission_audit_log.company_id)
-- =================================================================
--
-- Vessels (P1 is live first, D-25; the guard below enforces it): read =
-- a company member with fleet reach, reach to the vessel, or HR view (the
-- interim exception for HRIS cross-fleet joins, proposed D-124); write =
-- fleet.operations.vessels.admin. Definer RPCs that update vessels and the
-- service role are unaffected.
--
-- Role definitions (roles, role_permissions) are global rows shared by
-- every tenant: frozen to the service role (gap/01 F6). RBAC role
-- assignments (rbac_user_roles) and permission overrides are
-- company-scoped through the target user: users-access admin of the
-- target's company, never on yourself, never superadmin, never your own
-- rank or above (an equal rank only for a manager of admins), never above
-- your own module level; a vessel-scoped admin acts only on users of the
-- vessels they reach and never grants company-wide or fleet-conferring
-- roles; an administrator target needs a manager of admins (review round
-- 2, gap/01 F23, W7). The admin reads (rbac_user_roles, overrides,
-- user_roles) use admin_may_view_user() the same way. Legacy app roles
-- (user_roles) have no browser write path at all (CC-5 closes the live
-- "Superadmin and DPA can manage roles" hole): about 40 legacy policies
-- honoured a user_roles row without
-- asking which company it names, so a tenant admin who could write one
-- would reach every tenant; the service role writes them, and
-- 20261123010500_platform_role_scoped_policies.sql scopes those policies.
-- Every change is audited by trigger with actor = auth.uid(); the audit log
-- has no insert path for a browser any more, and log_permission_change()
-- stamps the caller as actor (CC-4: same signature, one overload).
--
-- Policies call only functions authenticated may execute (rule 11): the
-- predicates that need service-only helpers (role_rank, user_role_rank,
-- legacy_user_admin, has_capability_for, user_manages_admins_for) are
-- wrapped in caller-scoped definers evaluated for auth.uid() only.
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14, D-25)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vessels' AND column_name = 'code' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010100_platform_access_rls needs vessels.code NOT NULL (P1, D-25): apply 20261123000100_platform_vessel_tenancy.sql first';
  END IF;
  IF to_regprocedure('public.has_capability(text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_company_for_admin(uuid)') IS NULL
     OR to_regprocedure('public.role_rank(text)') IS NULL
     OR to_regprocedure('public.user_role_rank(uuid)') IS NULL
     OR to_regprocedure('public.legacy_user_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010100_platform_access_rls needs has_capability(), user_company_for_admin(), role_rank(), user_role_rank() and legacy_user_admin(): apply 20261123000400_platform_capabilities.sql first';
  END IF;
  IF to_regprocedure('public.user_manages_admins_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_is_admin_target(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010100_platform_access_rls needs user_manages_admins_for() and user_is_admin_target(): apply 20261123010000_platform_user_status.sql first';
  END IF;
  IF to_regprocedure('public.admin_scope_all(uuid,uuid)') IS NULL
     OR to_regprocedure('public.admin_may_act_on_user(uuid,uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.admin_may_view_user(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010100_platform_access_rls needs admin_scope_all(), admin_may_act_on_user(), admin_may_view_user() (20261123000400) and fleet_reach_for() (20261123000300)';
  END IF;
  IF to_regprocedure('public.user_can_reach_vessel(uuid,uuid)') IS NULL OR to_regprocedure('public.user_has_fleet_reach(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010100_platform_access_rls needs the reach helpers: apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.hr_can_view(uuid)') IS NULL
     OR to_regprocedure('public.rbac_company_permission(uuid,text,public.permission_level)') IS NULL
     OR to_regprocedure('public.log_permission_change(uuid,text,public.audit_action_type,uuid,uuid,text,jsonb,jsonb,text,uuid,inet,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010100_platform_access_rls needs the live hr_can_view(), rbac_company_permission() and log_permission_change() (20260129125250 signature)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- vessels

DROP POLICY IF EXISTS "Users can view vessels in their company" ON public.vessels;
DROP POLICY IF EXISTS "Users can manage vessels in their company" ON public.vessels;

DROP POLICY IF EXISTS vessels_select ON public.vessels;
CREATE POLICY vessels_select ON public.vessels
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.user_has_fleet_reach(auth.uid(), company_id)
      OR public.user_can_reach_vessel(auth.uid(), id)
      OR public.hr_can_view(auth.uid())
    )
  );

DROP POLICY IF EXISTS vessels_insert ON public.vessels;
CREATE POLICY vessels_insert ON public.vessels
  FOR INSERT TO authenticated
  WITH CHECK (public.has_capability('fleet.operations.vessels.admin', company_id));

DROP POLICY IF EXISTS vessels_update ON public.vessels;
CREATE POLICY vessels_update ON public.vessels
  FOR UPDATE TO authenticated
  USING (public.has_capability('fleet.operations.vessels.admin', company_id))
  WITH CHECK (public.has_capability('fleet.operations.vessels.admin', company_id));

DROP POLICY IF EXISTS vessels_delete ON public.vessels;
CREATE POLICY vessels_delete ON public.vessels
  FOR DELETE TO authenticated
  USING (public.has_capability('fleet.operations.vessels.admin', company_id));

REVOKE TRUNCATE ON TABLE public.vessels FROM anon, authenticated;

-- ---------------------------------------------------------------- roles and role permissions (frozen)

DROP POLICY IF EXISTS "Roles writable by admin" ON public.roles;
DROP POLICY IF EXISTS "Only admins can modify roles" ON public.roles;
DROP POLICY IF EXISTS "Role permissions writable by admin" ON public.role_permissions;
DROP POLICY IF EXISTS "Only admins can modify role permissions" ON public.role_permissions;

DROP POLICY IF EXISTS roles_write_service ON public.roles;
CREATE POLICY roles_write_service ON public.roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS role_permissions_write_service ON public.role_permissions;
CREATE POLICY role_permissions_write_service ON public.role_permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.roles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.role_permissions FROM anon, authenticated;

-- ---------------------------------------------------------------- caller-scoped write predicates (rule 11, CC-2)

-- May the caller assign / change / remove this RBAC role for that user?
-- Not on yourself; users-access admin in the target's company (and over the
-- vessel when one is given); the vessel belongs to that company; the role
-- exists and is not superadmin. Then (review round 2, gap/01 F23, W7, F23
-- no self-escalation):
--   scope        a grant with no vessel needs an all-vessels admin
--                (admin_scope_all); a vessel grant also needs that the caller
--                may act on the target (admin_may_act_on_user: every vessel
--                of the target in the caller's reach)
--   fleet        a fleet-conferring role ((no vessel and default scope
--                fleet) or dpa / fleet_master) needs the caller's own fleet
--                reach and an all-vessels admin
--   W7           an administrator target (user_is_admin_target) needs a
--                manager of admins
--   modules      unless a full legacy admin, the caller holds every
--                role_permissions right of the role (rbac_company_permission)
--   rank         ranks strictly below the caller, or equal to the caller
--                when the caller manages admins in that company (so a DPA
--                can appoint a DPA, shore management cannot mint its own
--                rank). role_rank 0 (unknown names) is harmless only for a
--                role with no fleet scope and no module rights: the checks
--                above, not the rank, stop a low-ranked fleet or module role.
CREATE OR REPLACE FUNCTION public.rbac_user_roles_write_allowed(_user_id uuid, _role_id uuid, _vessel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_company uuid;
  v_role_name text;
  v_role_scope text;
  v_rank integer;
  v_caller_rank integer;
BEGIN
  IF v_caller IS NULL OR _user_id IS NULL OR _role_id IS NULL OR _user_id = v_caller OR NOT public.user_is_active(v_caller) THEN
    RETURN false;
  END IF;
  v_company := public.user_company_for_admin(_user_id);
  IF v_company IS NULL THEN
    RETURN false;
  END IF;
  IF _vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = _vessel_id AND v.company_id = v_company) THEN
    RETURN false;
  END IF;
  IF NOT public.has_capability_for(v_caller, 'admin.access.users_access.admin', v_company, _vessel_id) THEN
    RETURN false;
  END IF;
  SELECT r.name, r.default_scope::text INTO v_role_name, v_role_scope FROM public.roles AS r WHERE r.id = _role_id;
  IF v_role_name IS NULL OR v_role_name = 'superadmin' THEN
    RETURN false;
  END IF;
  -- Scope: company-wide grants need an all-vessels admin; vessel grants a
  -- caller who may act on the target.
  IF _vessel_id IS NULL THEN
    IF NOT public.admin_scope_all(v_caller, v_company) THEN
      RETURN false;
    END IF;
  ELSIF NOT public.admin_may_act_on_user(v_caller, _user_id, v_company) THEN
    RETURN false;
  END IF;
  -- Fleet-conferring roles.
  IF ((_vessel_id IS NULL AND v_role_scope = 'fleet') OR v_role_name IN ('dpa', 'fleet_master'))
     AND NOT (public.fleet_reach_for(v_caller, v_company) AND public.admin_scope_all(v_caller, v_company)) THEN
    RETURN false;
  END IF;
  -- W7: an administrator target needs a manager of admins.
  IF public.user_is_admin_target(_user_id, v_company) AND NOT public.user_manages_admins_for(v_caller, v_company) THEN
    RETURN false;
  END IF;
  -- Module containment: no granting another module's rights you lack.
  IF NOT public.legacy_user_admin(v_caller) AND EXISTS (
    SELECT 1 FROM public.role_permissions AS rp
    WHERE rp.role_id = _role_id
      AND NOT coalesce(public.rbac_company_permission(v_caller, rp.module_key, rp.permission), false)
  ) THEN
    RETURN false;
  END IF;
  v_rank := public.role_rank(v_role_name);
  v_caller_rank := public.user_role_rank(v_caller);
  RETURN v_rank < v_caller_rank
      OR (v_rank = v_caller_rank AND public.user_manages_admins_for(v_caller, v_company));
END;
$$;

-- May the caller write this permission override? Not on yourself; the
-- company is the target's (as the stamp trigger sets it); users-access
-- admin there who may act on the target (vessel reach, gap/01 F23); a
-- manager of admins when the override is on the settings module (a
-- settings:admin grant makes a full admin, a deny can take one away) or
-- the target is an administrator (user_is_admin_target; W7); and the
-- caller holds that module level themselves (a full legacy admin, or
-- rbac_company_permission): no granting what you lack.
CREATE OR REPLACE FUNCTION public.permission_override_write_allowed(_user_id uuid, _company_id uuid, _module_key text, _permission public.permission_level)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR _user_id IS NULL OR _company_id IS NULL OR _module_key IS NULL OR _permission IS NULL
     OR _user_id = v_caller OR NOT public.user_is_active(v_caller) THEN
    RETURN false;
  END IF;
  IF public.user_company_for_admin(_user_id) IS DISTINCT FROM _company_id THEN
    RETURN false;
  END IF;
  IF NOT public.has_capability_for(v_caller, 'admin.access.users_access.admin', _company_id) THEN
    RETURN false;
  END IF;
  IF NOT public.admin_may_act_on_user(v_caller, _user_id, _company_id) THEN
    RETURN false;
  END IF;
  IF (_module_key = 'settings' OR public.user_is_admin_target(_user_id, _company_id))
     AND NOT public.user_manages_admins_for(v_caller, _company_id) THEN
    RETURN false;
  END IF;
  RETURN public.legacy_user_admin(v_caller) OR coalesce(public.rbac_company_permission(v_caller, _module_key, _permission), false);
END;
$$;

-- ---------------------------------------------------------------- rbac_user_roles

DROP POLICY IF EXISTS "RBAC user roles writable by admin" ON public.rbac_user_roles;
DROP POLICY IF EXISTS "Only admins can modify role assignments" ON public.rbac_user_roles;
DROP POLICY IF EXISTS "Users can view their own role assignments" ON public.rbac_user_roles;
DROP POLICY IF EXISTS "RBAC user roles self-readable" ON public.rbac_user_roles;

DROP POLICY IF EXISTS rbac_user_roles_select ON public.rbac_user_roles;
CREATE POLICY rbac_user_roles_select ON public.rbac_user_roles
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND public.user_is_active(auth.uid()))
    OR public.admin_may_view_user(user_id, public.user_company_for_admin(user_id))
  );

DROP POLICY IF EXISTS rbac_user_roles_insert ON public.rbac_user_roles;
CREATE POLICY rbac_user_roles_insert ON public.rbac_user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.rbac_user_roles_write_allowed(user_id, role_id, vessel_id));

DROP POLICY IF EXISTS rbac_user_roles_update ON public.rbac_user_roles;
CREATE POLICY rbac_user_roles_update ON public.rbac_user_roles
  FOR UPDATE TO authenticated
  USING (public.rbac_user_roles_write_allowed(user_id, role_id, vessel_id))
  WITH CHECK (public.rbac_user_roles_write_allowed(user_id, role_id, vessel_id));

DROP POLICY IF EXISTS rbac_user_roles_delete ON public.rbac_user_roles;
CREATE POLICY rbac_user_roles_delete ON public.rbac_user_roles
  FOR DELETE TO authenticated
  USING (public.rbac_user_roles_write_allowed(user_id, role_id, vessel_id));

REVOKE TRUNCATE ON TABLE public.rbac_user_roles FROM anon, authenticated;

-- ---------------------------------------------------------------- user_permission_overrides

ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS vessel_id uuid NULL;
ALTER TABLE public.user_permission_overrides
  DROP CONSTRAINT IF EXISTS user_permission_overrides_company_id_fkey,
  ADD CONSTRAINT user_permission_overrides_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.user_permission_overrides
  DROP CONSTRAINT IF EXISTS user_permission_overrides_vessel_id_fkey,
  ADD CONSTRAINT user_permission_overrides_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE;
-- No evaluator honours a vessel limit yet (user_has_permission,
-- rbac_company_permission, legacy_user_admin and the write predicate read
-- user / module / permission only), so a vessel-limited row would grant
-- company-wide rights. Reserved: NULL only until they do (D-124; the
-- vessel-scoped override design is X6).
ALTER TABLE public.user_permission_overrides
  DROP CONSTRAINT IF EXISTS user_permission_overrides_vessel_unsupported,
  ADD CONSTRAINT user_permission_overrides_vessel_unsupported CHECK (vessel_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_company ON public.user_permission_overrides (company_id, user_id);

-- Backfill: the target's profile company (rows of users without one stay NULL).
UPDATE public.user_permission_overrides AS o
SET company_id = p.company_id
FROM public.profiles AS p
WHERE p.user_id = o.user_id AND p.company_id IS NOT NULL AND o.company_id IS NULL;

-- trg_user_permission_overrides_stamp: company_id is always the target's
-- profile company (a client value is overwritten); created_by is the
-- signed-in caller on insert and never changes after; a vessel must be of
-- that company.
CREATE OR REPLACE FUNCTION public.user_permission_overrides_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.company_id INTO NEW.company_id FROM public.profiles AS p WHERE p.user_id = NEW.user_id;
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  IF NEW.vessel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id IS NOT DISTINCT FROM NEW.company_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'override_vessel_company_mismatch',
      DETAIL = 'A permission override can only name a vessel of the user''s own company.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_permission_overrides_stamp ON public.user_permission_overrides;
CREATE TRIGGER trg_user_permission_overrides_stamp
  BEFORE INSERT OR UPDATE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.user_permission_overrides_stamp();

-- trg_rbac_user_roles_stamp (D-230; review round 5,
-- actor-columns-client-forgeable): the who-did-it columns of an RBAC role
-- assignment are the server's, as created_by on overrides is. On INSERT
-- under a JWT, assigned_by is the signed-in caller and assigned_at now()
-- (whatever the client sent); on UPDATE both always keep the stored
-- values. Without a JWT (service role, maintenance, migrations) the given
-- values are kept. Definer write paths that run under the caller's JWT
-- record that caller.
CREATE OR REPLACE FUNCTION public.rbac_user_roles_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.assigned_by := auth.uid();
      NEW.assigned_at := now();
    END IF;
  ELSE
    NEW.assigned_by := OLD.assigned_by;
    NEW.assigned_at := OLD.assigned_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rbac_user_roles_stamp ON public.rbac_user_roles;
CREATE TRIGGER trg_rbac_user_roles_stamp
  BEFORE INSERT OR UPDATE ON public.rbac_user_roles
  FOR EACH ROW EXECUTE FUNCTION public.rbac_user_roles_stamp();

DROP POLICY IF EXISTS "Overrides writable by admin" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "Only admins can modify permission overrides" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "Users can view their own permission overrides" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "Overrides readable by admin" ON public.user_permission_overrides;

DROP POLICY IF EXISTS user_permission_overrides_select ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_select ON public.user_permission_overrides
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND public.user_is_active(auth.uid()))
    OR public.admin_may_view_user(user_id, company_id)
  );

DROP POLICY IF EXISTS user_permission_overrides_insert ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_insert ON public.user_permission_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.permission_override_write_allowed(user_id, company_id, module_key, permission));

DROP POLICY IF EXISTS user_permission_overrides_update ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_update ON public.user_permission_overrides
  FOR UPDATE TO authenticated
  USING (public.permission_override_write_allowed(user_id, company_id, module_key, permission))
  WITH CHECK (public.permission_override_write_allowed(user_id, company_id, module_key, permission));

DROP POLICY IF EXISTS user_permission_overrides_delete ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_delete ON public.user_permission_overrides
  FOR DELETE TO authenticated
  USING (public.permission_override_write_allowed(user_id, company_id, module_key, permission));

REVOKE TRUNCATE ON TABLE public.user_permission_overrides FROM anon, authenticated;

-- ---------------------------------------------------------------- user_roles (CC-5)

-- Legacy app roles are written by the service role only: no browser
-- INSERT, UPDATE or DELETE policy (an insert is refused with 42501, an
-- update or delete changes no row). Admins read their company's rows.
DROP POLICY IF EXISTS "Superadmin and DPA can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles in company" ON public.user_roles;
-- "Users can view their own roles" (own rows) stays.

DROP POLICY IF EXISTS user_roles_select_admin ON public.user_roles;
CREATE POLICY user_roles_select_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.admin_may_view_user(user_id, company_id));

DROP POLICY IF EXISTS user_roles_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete ON public.user_roles;
-- The predicate of those three policies (an earlier draft of this file).
DROP FUNCTION IF EXISTS public.user_roles_write_allowed(uuid, uuid, public.app_role);

REVOKE TRUNCATE ON TABLE public.user_roles FROM anon, authenticated;

-- ---------------------------------------------------------------- permission_audit_log

ALTER TABLE public.permission_audit_log ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE public.permission_audit_log
  DROP CONSTRAINT IF EXISTS permission_audit_log_company_id_fkey,
  ADD CONSTRAINT permission_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_company_time ON public.permission_audit_log (company_id, timestamp_utc DESC);

-- Backfill: the actor's profile company.
UPDATE public.permission_audit_log AS l
SET company_id = p.company_id
FROM public.profiles AS p
WHERE p.user_id = l.actor_user_id AND p.company_id IS NOT NULL AND l.company_id IS NULL;

DROP POLICY IF EXISTS "Audit log insert allowed" ON public.permission_audit_log;
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.permission_audit_log;
DROP POLICY IF EXISTS "Audit log readable by admin" ON public.permission_audit_log;
DROP POLICY IF EXISTS "Only admins can view permission audit logs" ON public.permission_audit_log;

DROP POLICY IF EXISTS permission_audit_log_select ON public.permission_audit_log;
CREATE POLICY permission_audit_log_select ON public.permission_audit_log
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.has_capability('admin.access.permission_audit_log.view', company_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.permission_audit_log FROM anon, authenticated;
REVOKE SELECT ON TABLE public.permission_audit_log FROM anon;

-- ---------------------------------------------------------------- audit triggers (gap/01 F53)

-- One permission_audit_log row per change of an access table, with
-- actor = auth.uid() (no row for service-role maintenance without a JWT),
-- the target's company, and before / after state as ids, module keys and
-- levels only (no names, emails or free text).
CREATE OR REPLACE FUNCTION public.access_change_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target uuid;
  v_action public.audit_action_type;
  v_before jsonb;
  v_after jsonb;
  v_role_id uuid;
  v_module text;
  v_vessel uuid;
  v_company uuid;
  v_actor_role text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;
  v_target := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;

  IF TG_TABLE_NAME = 'rbac_user_roles' THEN
    IF TG_OP <> 'INSERT' THEN
      v_before := jsonb_build_object('role_id', OLD.role_id, 'vessel_id', OLD.vessel_id, 'is_active', OLD.is_active, 'valid_from', OLD.valid_from, 'valid_until', OLD.valid_until);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_after := jsonb_build_object('role_id', NEW.role_id, 'vessel_id', NEW.vessel_id, 'is_active', NEW.is_active, 'valid_from', NEW.valid_from, 'valid_until', NEW.valid_until);
    END IF;
    v_role_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.role_id ELSE NEW.role_id END;
    v_vessel := CASE WHEN TG_OP = 'DELETE' THEN OLD.vessel_id ELSE NEW.vessel_id END;
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'role_assigned'
      WHEN TG_OP = 'DELETE' THEN 'role_removed'
      WHEN coalesce(OLD.is_active, true) AND NOT coalesce(NEW.is_active, true) THEN 'role_removed'
      WHEN NOT coalesce(OLD.is_active, true) AND coalesce(NEW.is_active, true) THEN 'role_assigned'
      ELSE 'permission_updated'
    END;
  ELSIF TG_TABLE_NAME = 'user_permission_overrides' THEN
    IF TG_OP <> 'INSERT' THEN
      v_before := jsonb_build_object('module_key', OLD.module_key, 'permission', OLD.permission, 'is_granted', OLD.is_granted, 'scope', OLD.scope, 'vessel_id', OLD.vessel_id, 'valid_until', OLD.valid_until);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_after := jsonb_build_object('module_key', NEW.module_key, 'permission', NEW.permission, 'is_granted', NEW.is_granted, 'scope', NEW.scope, 'vessel_id', NEW.vessel_id, 'valid_until', NEW.valid_until);
    END IF;
    v_module := CASE WHEN TG_OP = 'DELETE' THEN OLD.module_key ELSE NEW.module_key END;
    v_vessel := CASE WHEN TG_OP = 'DELETE' THEN OLD.vessel_id ELSE NEW.vessel_id END;
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'override_added' WHEN 'DELETE' THEN 'override_removed' ELSE 'permission_updated' END;
  ELSE -- user_roles (legacy app roles)
    IF TG_OP <> 'INSERT' THEN
      v_before := jsonb_build_object('app_role', OLD.role, 'company_id', OLD.company_id, 'vessel_id', OLD.vessel_id, 'is_active', OLD.is_active, 'expires_at', OLD.expires_at);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_after := jsonb_build_object('app_role', NEW.role, 'company_id', NEW.company_id, 'vessel_id', NEW.vessel_id, 'is_active', NEW.is_active, 'expires_at', NEW.expires_at);
    END IF;
    v_vessel := CASE WHEN TG_OP = 'DELETE' THEN OLD.vessel_id ELSE NEW.vessel_id END;
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'role_assigned'
      WHEN TG_OP = 'DELETE' THEN 'role_removed'
      WHEN coalesce(OLD.is_active, true) AND NOT coalesce(NEW.is_active, true) THEN 'role_removed'
      WHEN NOT coalesce(OLD.is_active, true) AND coalesce(NEW.is_active, true) THEN 'role_assigned'
      ELSE 'permission_updated'
    END;
  END IF;

  SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.user_id = v_target;
  SELECT p.role::text INTO v_actor_role FROM public.profiles AS p WHERE p.user_id = v_actor;

  INSERT INTO public.permission_audit_log (
    actor_user_id, actor_role, action_type, target_user_id, target_role_id, target_module_key,
    before_state, after_state, vessel_scope, is_high_impact, company_id
  ) VALUES (
    v_actor, coalesce(v_actor_role, 'unknown'), v_action, v_target, v_role_id, v_module,
    v_before, v_after, v_vessel,
    v_action IN ('role_assigned', 'role_removed') OR coalesce(v_module IN ('settings', 'hr', 'insurance', 'incidents'), false),
    v_company
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_rbac_user_roles_audit ON public.rbac_user_roles;
CREATE TRIGGER trg_rbac_user_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rbac_user_roles
  FOR EACH ROW EXECUTE FUNCTION public.access_change_audit();

DROP TRIGGER IF EXISTS trg_user_permission_overrides_audit ON public.user_permission_overrides;
CREATE TRIGGER trg_user_permission_overrides_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.access_change_audit();

DROP TRIGGER IF EXISTS trg_user_roles_audit ON public.user_roles;
CREATE TRIGGER trg_user_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.access_change_audit();

-- ---------------------------------------------------------------- log_permission_change (CC-4)

-- Exactly the live signature (20260129125250_51114894-…): any other argument
-- list would add a second overload and leave the forgeable one callable.
-- With a JWT caller (only reachable through another definer: the function
-- is service-role only) the actor is auth.uid() whatever p_actor_user_id
-- says, the role is the caller's legacy profile role, the company is the
-- caller's, the caller must be a users-access admin there, and the target
-- user and vessel must be of that company (42501 otherwise). Without a JWT
-- (the service role) the parameters are used and the company is the
-- actor's.
CREATE OR REPLACE FUNCTION public.log_permission_change(
  p_actor_user_id uuid,
  p_actor_role text,
  p_action_type public.audit_action_type,
  p_target_user_id uuid DEFAULT NULL,
  p_target_role_id uuid DEFAULT NULL,
  p_target_module_key text DEFAULT NULL,
  p_before_state jsonb DEFAULT NULL,
  p_after_state jsonb DEFAULT NULL,
  p_reason_text text DEFAULT NULL,
  p_vessel_scope uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_is_high_impact boolean := false;
  v_uid uuid := auth.uid();
  v_actor uuid;
  v_role text;
  v_company uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_actor := v_uid;
    SELECT p.role::text, p.company_id INTO v_role, v_company FROM public.profiles AS p WHERE p.user_id = v_uid;
    IF v_company IS NULL OR NOT public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_company) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
    END IF;
    IF p_target_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles AS t WHERE t.user_id = p_target_user_id AND t.company_id = v_company
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'target_outside_company';
    END IF;
    IF p_vessel_scope IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_scope AND v.company_id = v_company
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_outside_company';
    END IF;
  ELSE
    v_actor := p_actor_user_id;
    v_role := p_actor_role;
    SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.user_id = p_actor_user_id;
  END IF;

  IF p_action_type IN ('role_assigned', 'role_removed', 'permission_revoked', 'api_access_granted')
     OR p_target_module_key IN ('settings', 'hr', 'insurance', 'incidents') THEN
    v_is_high_impact := true;
  END IF;

  INSERT INTO public.permission_audit_log (
    actor_user_id, actor_role, action_type,
    target_user_id, target_role_id, target_module_key,
    before_state, after_state, reason_text,
    vessel_scope, ip_address, user_agent, is_high_impact, company_id
  ) VALUES (
    v_actor, coalesce(v_role, 'unknown'), p_action_type,
    p_target_user_id, p_target_role_id, p_target_module_key,
    p_before_state, p_after_state, p_reason_text,
    p_vessel_scope, p_ip_address, p_user_agent, v_is_high_impact, v_company
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.rbac_user_roles_write_allowed(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.permission_override_write_allowed(uuid, uuid, text, public.permission_level) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_permission_overrides_stamp() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rbac_user_roles_stamp() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.access_change_audit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_permission_change(uuid, text, public.audit_action_type, uuid, uuid, text, jsonb, jsonb, text, uuid, inet, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rbac_user_roles_write_allowed(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_override_write_allowed(uuid, uuid, text, public.permission_level) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_permission_change(uuid, text, public.audit_action_type, uuid, uuid, text, jsonb, jsonb, text, uuid, inet, text) TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.rbac_user_roles_write_allowed(uuid, uuid, uuid) IS 'Policy predicate (rule 11) for rbac_user_roles writes, for auth.uid() only: not on yourself, users-access admin of the target''s company (and vessel), vessel of that company, role not superadmin; no vessel: an all-vessels admin, a vessel: a caller who may act on the target (gap/01 F23); a fleet-conferring role (no vessel and default scope fleet, or dpa / fleet_master) needs the caller''s fleet reach and an all-vessels admin; an administrator target needs a manager of admins (W7); unless a full legacy admin, the caller holds every module right of the role; ranked strictly below the caller (equal only for a manager of admins of that company). Rank 0 is harmless only for roles with no fleet scope and no module rights.';
COMMENT ON FUNCTION public.permission_override_write_allowed(uuid, uuid, text, public.permission_level) IS 'Policy predicate (rule 11) for user_permission_overrides writes, for auth.uid() only: not on yourself, the target''s company, users-access admin there who may act on the target (gap/01 F23), a manager of admins for a settings override or an administrator target (W7), and the caller holds the module level (full admin or rbac_company_permission).';
COMMENT ON FUNCTION public.user_permission_overrides_stamp() IS 'Trigger: company_id = the target''s profile company (client value overwritten), created_by = the signed-in caller on insert (kept on update), vessel of that company only.';
COMMENT ON FUNCTION public.rbac_user_roles_stamp() IS 'Trigger trg_rbac_user_roles_stamp (D-230): on INSERT under a JWT assigned_by = auth.uid() and assigned_at = now() (client values overwritten); on UPDATE both keep the stored values; without a JWT the given values are kept.';
COMMENT ON COLUMN public.rbac_user_roles.assigned_by IS 'Who assigned the role: the signed-in caller, stamped by trg_rbac_user_roles_stamp (D-230); never changed by an update. Service-role inserts keep the given value.';
COMMENT ON COLUMN public.rbac_user_roles.assigned_at IS 'When the role was assigned: now() at a signed-in insert, stamped by trg_rbac_user_roles_stamp (D-230); never changed by an update.';
COMMENT ON FUNCTION public.access_change_audit() IS 'Trigger (gap/01 F53): one permission_audit_log row per change of rbac_user_roles, user_permission_overrides or user_roles, actor = auth.uid(), ids / keys / levels only. Skipped without a JWT (service-role maintenance).';
COMMENT ON FUNCTION public.log_permission_change(uuid, text, public.audit_action_type, uuid, uuid, text, jsonb, jsonb, text, uuid, inet, text) IS 'CC-4: the live signature, one overload. With a JWT the actor, role and company are the caller''s (users-access admin required; target and vessel of that company); without, the parameters are used. Service role only.';
COMMENT ON COLUMN public.user_permission_overrides.company_id IS 'The target user''s company (stamped by trg_user_permission_overrides_stamp); scopes reads and writes.';
COMMENT ON COLUMN public.user_permission_overrides.vessel_id IS 'Reserved: must be NULL until the evaluators honour a vessel limit (D-124)';
COMMENT ON COLUMN public.permission_audit_log.company_id IS 'The company the change belongs to (the target''s company; backfilled from the actor''s profile). Reads: permission-audit viewers of that company only.';
