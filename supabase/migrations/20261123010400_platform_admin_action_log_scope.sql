-- =================================================================
-- PLATFORM P3 follow-up: the admin action log is company-scoped and has
-- no browser write path (gap/01 F6, F47, W7; Phase 2 security rules;
-- proposed D-124)
-- Tables: none new. Columns: admin_action_log.company_id
-- Policies: admin_action_log_select (replaces the legacy "DPA can view
--   admin action logs" / "DPA can insert admin action logs")
-- Helpers: trigger trg_admin_action_log_company
--   (admin_action_log_stamp_company())
-- TS mirror: none (the browser reads the log only through Users & Access;
--   its writer in the form templates page is removed by the client fix)
-- =================================================================
--
-- The legacy policies (20260129122422_b6a602fd-…, before Phase 2) let any
-- holder of a user_roles superadmin / dpa row of any company read every
-- tenant's admin actions, the free-text reasons included, and insert
-- forged rows naming any actor. Phase 2's set_membership_status writes its
-- TOGGLE_ACCESS rows (with the disable reason, personal data) here, so the
-- hole widened. The log now follows the permission_audit_log pattern of
-- 20261123010100_platform_access_rls.sql:
--
--   company_id   the target's company (target_crew_id's profile, then
--                target_user_id's), else the actor's; backfilled here and
--                filled on insert by trg_admin_action_log_company when the
--                writer leaves it NULL (set_membership_status and the
--                admin-actions service-role writes need no change)
--   read         permission-audit viewers of that company only
--   write        the service role and definers only (no INSERT policy, no
--                browser privileges); unresolvable rows (company NULL) are
--                read by the service role only
--
-- This closes gap/01 F6 for admin_action_log.
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.admin_action_log') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010400_platform_admin_action_log_scope needs public.admin_action_log (20260129122422)';
  END IF;
  IF to_regprocedure('public.has_capability(text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010400_platform_admin_action_log_scope needs has_capability(): apply 20261123000400_platform_capabilities.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- column, index, backfill

ALTER TABLE public.admin_action_log ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE public.admin_action_log
  DROP CONSTRAINT IF EXISTS admin_action_log_company_id_fkey,
  ADD CONSTRAINT admin_action_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_admin_action_log_company_time ON public.admin_action_log (company_id, created_at DESC);

-- The target profile (by profile id, then by login), else the actor's.
UPDATE public.admin_action_log AS l
SET company_id = coalesce(
  (SELECT p.company_id FROM public.profiles AS p WHERE p.id = l.target_crew_id),
  (SELECT p.company_id FROM public.profiles AS p WHERE p.user_id = l.target_user_id),
  (SELECT p.company_id FROM public.profiles AS p WHERE p.user_id = l.actor_user_id)
)
WHERE l.company_id IS NULL
  AND coalesce(
    (SELECT p.company_id FROM public.profiles AS p WHERE p.id = l.target_crew_id),
    (SELECT p.company_id FROM public.profiles AS p WHERE p.user_id = l.target_user_id),
    (SELECT p.company_id FROM public.profiles AS p WHERE p.user_id = l.actor_user_id)
  ) IS NOT NULL;

-- ---------------------------------------------------------------- trg_admin_action_log_company

-- Fills a NULL company_id the same way as the backfill. A writer that
-- passes a company keeps it (only the service role and definers write).
CREATE OR REPLACE FUNCTION public.admin_action_log_stamp_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := coalesce(
      (SELECT p.company_id FROM public.profiles AS p WHERE p.id = NEW.target_crew_id),
      (SELECT p.company_id FROM public.profiles AS p WHERE p.user_id = NEW.target_user_id),
      (SELECT p.company_id FROM public.profiles AS p WHERE p.user_id = NEW.actor_user_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_action_log_company ON public.admin_action_log;
CREATE TRIGGER trg_admin_action_log_company
  BEFORE INSERT ON public.admin_action_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_action_log_stamp_company();

-- ---------------------------------------------------------------- policies and grants

DROP POLICY IF EXISTS "DPA can view admin action logs" ON public.admin_action_log;
DROP POLICY IF EXISTS "DPA can insert admin action logs" ON public.admin_action_log;

DROP POLICY IF EXISTS admin_action_log_select ON public.admin_action_log;
CREATE POLICY admin_action_log_select ON public.admin_action_log
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.has_capability('admin.access.permission_audit_log.view', company_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.admin_action_log FROM anon, authenticated;
REVOKE SELECT ON TABLE public.admin_action_log FROM anon;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.admin_action_log_stamp_company() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.admin_action_log IS 'Audit trail of admin actions (RESET_ACCOUNT, TOGGLE_ACCESS, REALLOCATE_VESSEL, SET_PIN; gap/01 W7). company_id = the target''s company (else the actor''s), stamped by trg_admin_action_log_company. Read: permission-audit viewers of that company only. Write: the service role and definers only (no browser path).';
COMMENT ON COLUMN public.admin_action_log.company_id IS 'The company the action belongs to: the target profile''s (target_crew_id, then target_user_id), else the actor''s; NULL rows are service-role only.';
COMMENT ON FUNCTION public.admin_action_log_stamp_company() IS 'Trigger trg_admin_action_log_company: fills a NULL company_id from the target profile, else the actor''s profile.';
