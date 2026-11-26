-- =================================================================
-- PLATFORM P4: export jobs (gap/08 EX1, EX3, EX4, §G; DECISIONS C10;
-- Phase 2 spec §A.14, CC-27)
-- Tables: export_jobs (status machine, guard trigger)
-- Helpers: export_module_key(), request_export(), log_client_export(),
--   cancel_export_job(), export_job_transition() (service role); trigger
--   export_jobs_guard()
-- TS mirror: src/lib/records/services/db.pending.ts (RecordsPendingTables
--   export_jobs, RecordsPendingFunctions request_export / log_client_export
--   / cancel_export_job), src/lib/records/services/exports.ts
-- =================================================================
--
-- The machine (only export_job_transition moves a server job, under
-- storm.record_engine, for every role including the service role):
--   requested -> running | failed | cancelled
--   running   -> ready | failed
--   ready     -> expired
--   expired   -> purged
-- ready needs storage_path, size_bytes and sha256; failed needs an
-- error_code. Clients only request (requested, generated_by 'server'), log
-- a browser-generated export before the download (EX4: generated_by
-- 'client', status 'ready' at once) and cancel their own requested job. A
-- client can never set ready.
--
-- No export builder exists in Phase 2: a requested job stays requested and
-- the UI says "Queued" (no fake completion). export_downloads (C10, the
-- per-download audit of EX3) is NOT created here: there is nothing to
-- download until the builder lands; it comes with the builder (spec §J 6),
-- deferred, not dropped (CC-27).
--
-- Events (record_events, entity_type 'export_job', from -> to status):
-- export.requested, export.logged, export.<status>; ready / failed carry the
-- notification export_ready / export_failed (file 15 fans them out to the
-- requester). Payloads carry the kind and source key, never the params.
-- Who exported whose data is itself personal data: the RESTRICTIVE policy
-- record_events_export_job_audience narrows export events to the
-- export_jobs audience (the requester while active, permission-audit
-- viewers of the company), whatever record_readable() allows for other
-- record events.
--
-- Deleting a user or a vessel (review round 4, export-jobs-block-user-delete):
-- a job is an anonymised audit row then. requested_by and vessel_id are set
-- NULL by their foreign keys (ON DELETE SET NULL), export_jobs_guard lets
-- exactly that referential SET NULL through, and nobody can cancel an
-- orphaned job (the requester is gone). Jobs themselves are still never
-- deleted (a company delete stays blocked by record_events, D-152).
--
-- Errors: a business rule raises 22023 with a stable code as the message;
-- authorisation 42501; an unknown id P0002.
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.record_events') IS NULL OR to_regprocedure('public.record_impersonating()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020400_platform_export_jobs needs record_events: apply 20261123020000_platform_record_registry.sql first';
  END IF;
  IF to_regprocedure('public.has_capability(text,uuid,uuid)') IS NULL OR to_regprocedure('public.is_company_actor(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020400_platform_export_jobs needs has_capability(): apply 20261123000400_platform_capabilities.sql first';
  END IF;
  IF to_regprocedure('public.user_has_fleet_reach(uuid,uuid)') IS NULL OR to_regprocedure('public.user_can_reach_vessel(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020400_platform_export_jobs needs the reach helpers: apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.profiles_guard_access_columns()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020400_platform_export_jobs needs the active-aware helpers: apply 20261123010000_platform_user_status.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- table

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  requested_by uuid NULL,
  kind text NOT NULL,
  generated_by text NOT NULL,
  source_key text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  contains_personal_data boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'requested',
  storage_path text NULL,
  size_bytes bigint NULL,
  sha256 text NULL,
  row_count integer NULL,
  error_code text NULL,
  link_expires_at timestamptz NULL,
  purge_at timestamptz NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT export_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT export_jobs_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE SET NULL,
  CONSTRAINT export_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT export_jobs_kind_check CHECK (kind IN ('record_pdf', 'register_pdf', 'csv', 'xlsx', 'zip', 'compliance_pack', 'gdpr_subject', 'ics')),
  CONSTRAINT export_jobs_generated_by_check CHECK (generated_by IN ('client', 'server')),
  CONSTRAINT export_jobs_source_key_check CHECK (source_key ~ '^[a-z][a-z0-9_.:-]{0,120}$'),
  CONSTRAINT export_jobs_params_check CHECK (jsonb_typeof(params) = 'object'),
  CONSTRAINT export_jobs_status_check CHECK (status IN ('requested', 'running', 'ready', 'failed', 'cancelled', 'expired', 'purged')),
  CONSTRAINT export_jobs_storage_path_check CHECK (storage_path IS NULL OR length(storage_path) BETWEEN 1 AND 1024),
  CONSTRAINT export_jobs_size_bytes_check CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CONSTRAINT export_jobs_sha256_check CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT export_jobs_row_count_check CHECK (row_count IS NULL OR row_count >= 0),
  CONSTRAINT export_jobs_error_code_check CHECK (error_code IS NULL OR error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT export_jobs_ready_check CHECK (status <> 'ready' OR completed_at IS NOT NULL),
  CONSTRAINT export_jobs_client_check CHECK (generated_by = 'server' OR status IN ('ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_requester ON public.export_jobs (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_company_status ON public.export_jobs (company_id, status);

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.export_jobs FROM anon, authenticated;
GRANT SELECT ON TABLE public.export_jobs TO authenticated;
GRANT ALL ON TABLE public.export_jobs TO service_role;

DROP TRIGGER IF EXISTS trg_export_jobs_updated_at ON public.export_jobs;
CREATE TRIGGER trg_export_jobs_updated_at
  BEFORE UPDATE ON public.export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The requester reads their own jobs; admins who may read the permission
-- audit log read the company's (exports of personal data are audited).
DROP POLICY IF EXISTS export_jobs_select ON public.export_jobs;
CREATE POLICY export_jobs_select ON public.export_jobs
  FOR SELECT TO authenticated
  USING ((requested_by = auth.uid() AND public.user_is_active(auth.uid()))
         OR public.has_capability('admin.access.permission_audit_log.view', company_id));

-- Export events in record_events follow the export_jobs audience: the
-- EXISTS runs under export_jobs RLS, so the audience is exactly
-- export_jobs_select and never drifts from it (jobs are never deleted, so
-- it holds through purged). Other record events keep record_events_select.
DROP POLICY IF EXISTS record_events_export_job_audience ON public.record_events;
CREATE POLICY record_events_export_job_audience ON public.record_events
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (entity_type IS DISTINCT FROM 'export_job'
         OR EXISTS (SELECT 1 FROM public.export_jobs AS j WHERE j.id = record_events.entity_id));

-- ---------------------------------------------------------------- guard (storm.record_engine, every role)

-- Outside the engine flag nothing but updated_at changes on an export job,
-- except the referential SET NULL of requested_by or vessel_id when that
-- user or vessel is deleted (review round 4); no job is deleted, and a new
-- job starts requested (server). The flag is set and reset by the definers
-- of this file only.
CREATE OR REPLACE FUNCTION public.export_jobs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('storm.record_engine', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_status_is_server_owned', DETAIL = 'Export jobs are expired and purged, never deleted.';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'requested' OR NEW.generated_by <> 'server' OR NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL
       OR NEW.storage_path IS NOT NULL OR NEW.size_bytes IS NOT NULL OR NEW.sha256 IS NOT NULL OR NEW.error_code IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_status_is_server_owned', DETAIL = 'A job starts requested; only the export engine moves it.';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    -- A deleted user or vessel (ON DELETE SET NULL): only those columns, and
    -- only to NULL, never to another value.
    IF (to_jsonb(NEW) - ARRAY['updated_at', 'requested_by', 'vessel_id']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at', 'requested_by', 'vessel_id'])
       AND (NEW.requested_by IS NULL OR NEW.requested_by = OLD.requested_by)
       AND (NEW.vessel_id IS NULL OR NEW.vessel_id = OLD.vessel_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_status_is_server_owned', DETAIL = 'Only the export engine (export_job_transition) changes a job.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_export_jobs_guard ON public.export_jobs;
CREATE TRIGGER trg_export_jobs_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.export_jobs_guard();

-- ---------------------------------------------------------------- helpers

-- The module of an export source key ('safety.incidents:register' ->
-- 'safety'): the record_events module_key of its events.
CREATE OR REPLACE FUNCTION public.export_module_key(p_source_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(substring(p_source_key FROM '^[a-z][a-z0-9_]*'), 'exports')
$$;

-- One record_events row for an export job (entity export_job).
CREATE OR REPLACE FUNCTION public.export_job_log(p_job public.export_jobs, p_action text, p_from text, p_party text, p_notification text DEFAULT NULL)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.record_events (company_id, vessel_id, module_key, entity_type, entity_id, action, party, actor_user_id, from_status, to_status, payload, notification_type)
  VALUES (p_job.company_id, p_job.vessel_id, public.export_module_key(p_job.source_key), 'export_job', p_job.id, p_action, p_party, auth.uid(),
          p_from, p_job.status,
          jsonb_strip_nulls(jsonb_build_object('export_job_id', p_job.id, 'kind', p_job.kind, 'source_key', p_job.source_key,
            'generated_by', p_job.generated_by, 'requested_by', p_job.requested_by, 'error_code', p_job.error_code,
            'contains_personal_data', p_job.contains_personal_data)),
          p_notification)
$$;

-- The caller's company and the scope check shared by request_export and
-- log_client_export: an active caller; a vessel of their company that they
-- reach (fleet reach passes), or fleet reach for a fleet export. Returns
-- the company id; raises 42501 otherwise, 22023 for invalid input.
CREATE OR REPLACE FUNCTION public.export_scope_check(p_kind text, p_source_key text, p_params jsonb, p_vessel_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_access_denied';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_access_denied';
  END IF;
  IF p_vessel_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = v_company)
       OR NOT (public.user_has_fleet_reach(v_uid, v_company) OR public.user_can_reach_vessel(v_uid, p_vessel_id)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_access_denied';
    END IF;
  ELSIF NOT public.user_has_fleet_reach(v_uid, v_company) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_access_denied', DETAIL = 'A fleet-wide export needs access to the Fleet view.';
  END IF;
  IF public.record_impersonating() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'impersonating', DETAIL = 'Exports cannot be made while acting as another user.';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('record_pdf', 'register_pdf', 'csv', 'xlsx', 'zip', 'compliance_pack', 'gdpr_subject', 'ics') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'export_kind_invalid';
  END IF;
  IF p_source_key IS NULL OR p_source_key !~ '^[a-z][a-z0-9_.:-]{0,120}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'source_key_invalid';
  END IF;
  IF p_params IS NULL OR jsonb_typeof(p_params) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'params_invalid';
  END IF;
  IF length(p_params::text) > 8000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'params_too_large';
  END IF;
  RETURN v_company;
END;
$$;

-- ---------------------------------------------------------------- the machine (service role)

-- export_job_transition: the only path that moves a server job (spec
-- §A.14). Legal pairs only (22023 export_transition_invalid otherwise, and
-- always for a client-generated job); ready needs storage_path, size_bytes
-- and sha256 (from the patch or already on the job); failed needs an
-- error_code. The patch may carry only storage_path, size_bytes, sha256,
-- row_count, error_code, link_expires_at and purge_at. Stamps started_at
-- (running) and completed_at (ready, failed). Event export.<status>,
-- notification export_ready / export_failed.
CREATE OR REPLACE FUNCTION public.export_job_transition(p_job_id uuid, p_to text, p_patch jsonb DEFAULT '{}'::jsonb)
RETURNS public.export_jobs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  j public.export_jobs;
  n public.export_jobs;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_path text;
  v_size bigint;
  v_sha text;
  v_rows integer;
  v_error text;
  v_link_expires timestamptz;
  v_purge timestamptz;
  v_party text;
BEGIN
  SELECT * INTO j FROM public.export_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'export_not_found';
  END IF;
  IF j.generated_by <> 'server' OR p_to IS NULL OR NOT (
       (j.status = 'requested' AND p_to IN ('running', 'failed', 'cancelled'))
    OR (j.status = 'running' AND p_to IN ('ready', 'failed'))
    OR (j.status = 'ready' AND p_to = 'expired')
    OR (j.status = 'expired' AND p_to = 'purged')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'export_transition_invalid',
      DETAIL = format('An export job cannot go from %s to %s.', j.status, coalesce(p_to, 'nothing'));
  END IF;
  IF jsonb_typeof(v_patch) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_patch) AS key
    WHERE key NOT IN ('storage_path', 'size_bytes', 'sha256', 'row_count', 'error_code', 'link_expires_at', 'purge_at')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'patch_invalid';
  END IF;
  BEGIN
    v_path := coalesce(nullif(btrim(v_patch ->> 'storage_path'), ''), j.storage_path);
    v_size := coalesce((v_patch ->> 'size_bytes')::bigint, j.size_bytes);
    v_sha := coalesce(v_patch ->> 'sha256', j.sha256);
    v_rows := coalesce((v_patch ->> 'row_count')::integer, j.row_count);
    v_error := coalesce(v_patch ->> 'error_code', j.error_code);
    v_link_expires := coalesce((v_patch ->> 'link_expires_at')::timestamptz, j.link_expires_at);
    v_purge := coalesce((v_patch ->> 'purge_at')::timestamptz, j.purge_at);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'patch_invalid';
  END;
  IF (v_size IS NOT NULL AND v_size < 0) OR (v_rows IS NOT NULL AND v_rows < 0)
     OR (v_sha IS NOT NULL AND v_sha !~ '^[0-9a-f]{64}$')
     OR (v_error IS NOT NULL AND v_error !~ '^[a-z][a-z0-9_]{0,63}$')
     OR (v_path IS NOT NULL AND length(v_path) > 1024) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'patch_invalid';
  END IF;
  IF p_to = 'ready' AND (v_path IS NULL OR v_size IS NULL OR v_sha IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'export_output_required', DETAIL = 'A ready export needs its file path, size and sha256.';
  END IF;
  IF p_to = 'failed' AND v_error IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'error_code_required';
  END IF;

  PERFORM set_config('storm.record_engine', 'on', true);
  UPDATE public.export_jobs SET
    status = p_to,
    storage_path = v_path,
    size_bytes = v_size,
    sha256 = v_sha,
    row_count = v_rows,
    error_code = CASE WHEN p_to = 'failed' THEN v_error ELSE j.error_code END,
    link_expires_at = v_link_expires,
    purge_at = v_purge,
    started_at = CASE WHEN p_to = 'running' THEN now() ELSE j.started_at END,
    completed_at = CASE WHEN p_to IN ('ready', 'failed') THEN now() ELSE j.completed_at END
  WHERE id = j.id
  RETURNING * INTO n;
  v_party := CASE WHEN v_uid IS NULL THEN 'system' WHEN public.is_company_actor(v_uid, j.vessel_id) THEN 'company' ELSE 'vessel' END;
  PERFORM public.export_job_log(n, 'export.' || p_to, j.status, v_party,
    CASE p_to WHEN 'ready' THEN 'export_ready' WHEN 'failed' THEN 'export_failed' END);
  PERFORM set_config('storm.record_engine', v_prev_flag, true);
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------- the client API

-- request_export: a server-built export (requested; no builder in Phase 2,
-- so it stays requested and the UI says "Queued"). gdpr_subject always
-- contains personal data. Event export.requested.
CREATE OR REPLACE FUNCTION public.request_export(
  p_kind text,
  p_source_key text,
  p_params jsonb DEFAULT '{}'::jsonb,
  p_contains_personal_data boolean DEFAULT false,
  p_vessel_id uuid DEFAULT NULL
)
RETURNS public.export_jobs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  v_company uuid;
  j public.export_jobs;
BEGIN
  v_company := public.export_scope_check(p_kind, p_source_key, coalesce(p_params, '{}'::jsonb), p_vessel_id);
  PERFORM set_config('storm.record_engine', 'on', true);
  INSERT INTO public.export_jobs (company_id, vessel_id, requested_by, kind, generated_by, source_key, params, contains_personal_data, status)
  VALUES (v_company, p_vessel_id, v_uid, p_kind, 'server', p_source_key, coalesce(p_params, '{}'::jsonb),
          coalesce(p_contains_personal_data, false) OR p_kind = 'gdpr_subject', 'requested')
  RETURNING * INTO j;
  PERFORM public.export_job_log(j, 'export.requested', NULL, CASE WHEN public.is_company_actor(v_uid, p_vessel_id) THEN 'company' ELSE 'vessel' END);
  PERFORM set_config('storm.record_engine', v_prev_flag, true);
  RETURN j;
END;
$$;

-- log_client_export (EX4): a browser-generated export is logged before the
-- download (generated_by 'client', status ready, completed now). Event
-- export.logged: the requester gets no notification (they have the file);
-- the DPA is notified when the export contains personal data (D-238:
-- trg_record_events_personal_data, 20261123030000).
CREATE OR REPLACE FUNCTION public.log_client_export(
  p_kind text,
  p_source_key text,
  p_params jsonb DEFAULT '{}'::jsonb,
  p_contains_personal_data boolean DEFAULT false,
  p_row_count integer DEFAULT NULL,
  p_vessel_id uuid DEFAULT NULL
)
RETURNS public.export_jobs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  v_company uuid;
  j public.export_jobs;
BEGIN
  v_company := public.export_scope_check(p_kind, p_source_key, coalesce(p_params, '{}'::jsonb), p_vessel_id);
  IF p_row_count IS NOT NULL AND p_row_count < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'row_count_invalid';
  END IF;
  PERFORM set_config('storm.record_engine', 'on', true);
  INSERT INTO public.export_jobs (company_id, vessel_id, requested_by, kind, generated_by, source_key, params, contains_personal_data, status,
                                  row_count, started_at, completed_at)
  VALUES (v_company, p_vessel_id, v_uid, p_kind, 'client', p_source_key, coalesce(p_params, '{}'::jsonb),
          coalesce(p_contains_personal_data, false) OR p_kind = 'gdpr_subject', 'ready', p_row_count, now(), now())
  RETURNING * INTO j;
  PERFORM public.export_job_log(j, 'export.logged', NULL, CASE WHEN public.is_company_actor(v_uid, p_vessel_id) THEN 'company' ELSE 'vessel' END);
  PERFORM set_config('storm.record_engine', v_prev_flag, true);
  RETURN j;
END;
$$;

-- cancel_export_job: the requester only (42501 for anyone else, admins
-- included, and for everyone on an orphaned job whose requester was
-- deleted), requested -> cancelled (22023 export_not_cancellable from any
-- other status; an already cancelled job is returned unchanged).
CREATE OR REPLACE FUNCTION public.cancel_export_job(p_job_id uuid)
RETURNS public.export_jobs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  j public.export_jobs;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_access_denied';
  END IF;
  SELECT * INTO j FROM public.export_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'export_not_found';
  END IF;
  IF j.requested_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'export_access_denied', DETAIL = 'Only the person who asked for an export cancels it.';
  END IF;
  IF j.status = 'cancelled' THEN
    RETURN j;
  END IF;
  IF j.status <> 'requested' OR j.generated_by <> 'server' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'export_not_cancellable', DETAIL = 'Only a queued export can be cancelled.';
  END IF;
  RETURN public.export_job_transition(j.id, 'cancelled', '{}'::jsonb);
END;
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.export_jobs_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_module_key(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_job_log(public.export_jobs, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_scope_check(text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_job_transition(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_export(text, text, jsonb, boolean, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_client_export(text, text, jsonb, boolean, integer, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_export_job(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.export_module_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_job_log(public.export_jobs, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.export_scope_check(text, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.export_job_transition(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_export(text, text, jsonb, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_client_export(text, text, jsonb, boolean, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_export_job(uuid) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.export_jobs IS 'Export jobs (gap/08 EX1, EX3, EX4; C10): server jobs requested -> running -> ready | failed (-> expired -> purged), client exports logged as ready before the download. Read: the requester, and admins who may read the permission audit log; their record_events (entity export_job) have the same audience (record_events_export_job_audience). requested_by and vessel_id become NULL when that user or vessel is deleted (ON DELETE SET NULL): the job stays as an anonymised audit row (review round 4). No client writes: request_export / log_client_export / cancel_export_job; only export_job_transition (service role) moves a server job (trg_export_jobs_guard, every role). export_downloads lands with the export builder (C10, deferred).';
COMMENT ON FUNCTION public.export_jobs_guard() IS 'Trigger: export jobs change only under storm.record_engine (every role), except the referential SET NULL of requested_by or vessel_id (a deleted user or vessel); never deleted; a job created outside the engine starts requested (server).';
COMMENT ON FUNCTION public.export_module_key(text) IS 'The module of an export source key (its first snake_case word). Pure.';
COMMENT ON FUNCTION public.export_job_log(public.export_jobs, text, text, text, text) IS 'Internal: one record_events row for an export job (entity export_job; ids and codes only).';
COMMENT ON FUNCTION public.export_scope_check(text, text, jsonb, uuid) IS 'Internal: the caller''s company for an export, after the reach (vessel or fleet) and input checks.';
COMMENT ON FUNCTION public.export_job_transition(uuid, text, jsonb) IS 'The export machine (service role): requested -> running | failed | cancelled; running -> ready | failed; ready -> expired; expired -> purged. Event export.<status>; ready / failed notify the requester.';
COMMENT ON FUNCTION public.request_export(text, text, jsonb, boolean, uuid) IS 'Requests a server export (stays requested until a builder exists). Vessel exports need reach, fleet exports fleet reach.';
COMMENT ON FUNCTION public.log_client_export(text, text, jsonb, boolean, integer, uuid) IS 'Logs a browser-generated export before its download (EX4): generated_by client, ready. The requester gets no notification; the DPA is notified when the export contains personal data (D-238).';
COMMENT ON FUNCTION public.cancel_export_job(uuid) IS 'Cancels the caller''s own queued (requested) export; nobody cancels an orphaned job (requested_by NULL).';
