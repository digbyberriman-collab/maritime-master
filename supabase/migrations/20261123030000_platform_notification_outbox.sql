-- =================================================================
-- PLATFORM P5: notification outbox and inbox (gap/03 C1, C9, C11, C12;
-- gap/08 NO1-NO3, NO6, §N; DECISIONS D-62; Phase 2 spec §A.15, CC-16;
-- proposed D-127, D-128)
-- Tables: notification_outbox (one row per event, service only),
--   notification_inbox (one row per recipient; own rows; read_at /
--   archived_at the only client-writable columns)
-- Helpers: emit_notification_event() (service role; definers call it),
--   notification_recipients(), notification_fan_out(),
--   process_notification_outbox() (service role; retry processor for a
--   later cron), notification_inbox_mark_all_read() (authenticated);
--   triggers notification_outbox_guard(), record_event_notify()
--   (trg_record_events_emit on record_events),
--   record_event_notify_personal_data() (trg_record_events_personal_data on
--   record_events: the DPA notice of a personal-data export, D-238)
-- Seed: the engine notification types in the live notification_types
-- TS mirror: src/modules/notifications/types/db.pending.ts
--   (NotificationsPendingTables notification_inbox,
--   NotificationsPendingFunctions notification_inbox_mark_all_read),
--   src/modules/notifications/services/inbox.ts, lib/deepLink.ts
-- =================================================================
--
-- Fan-out mode (proposed D-128): inline at emit time, with a retry
-- processor. emit_notification_event() inserts the outbox row and fans out
-- in the same transaction inside a BEGIN ... EXCEPTION sub-block: when the
-- fan-out fails, the outbox row stays unprocessed with attempts + 1 and
-- last_error (a code), and the caller's transaction still commits (a
-- notification never blocks a signature). process_notification_outbox()
-- retries such rows (FOR UPDATE SKIP LOCKED, at most 5 attempts).
--
-- Recipients (notification_recipients) run inside the actor's transaction,
-- so they use the internal reach functions (rule 12: reach_vessel_for,
-- fleet_reach_for, is_company_actor): must-act users plus the audience
-- (vessel_members, owner_admins, fleet_reach, dpa), then only active users
-- of the event's company who reach the vessel (fleet reach counts) or are a
-- company actor, never the actor, never a user who switched the type off
-- in-app (user_notification_preferences; else the type's default), and
-- nobody at all when the event's module is switched off on its vessel
-- (vessel_module_on_internal(), the module_enabled() rule without the
-- caller clause; gap/01 W6, D-162; review round 5,
-- notify-ignores-module-off), except a personal-scope link (export_ready /
-- export_failed reach their requester). An off module fans out zero rows
-- and the outbox row is still marked processed, so nothing is claimed as
-- delivered.
--
-- Record-engine wiring: trg_record_events_emit (AFTER INSERT ON
-- record_events, rows with a notification_type) -> record_event_notify(),
-- which builds the title (reference + what happened; no names), the deep
-- link (vessel code stored at emit, or fleet; record kind + id, so the
-- client registry resolves the route) and the audience / severity of spec
-- §A.15, and emits with dedupe key 'event:<event id>'. A notification
-- never rolls back the engine action (CC-16): title and body are cut to the
-- CHECK limits and the emit sits in an exception block that raises a
-- WARNING (notification_emit_failed: <sqlstate>); nothing is claimed as
-- sent.
--
-- Email delivery (gap/03 C3 dispatcher, notification_deliveries) is not in
-- Phase 2.
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.record_events') IS NULL OR to_regclass('public.record_thread_entries') IS NULL OR to_regclass('public.record_signatures') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123030000_platform_notification_outbox needs the record engine: apply 20261123020000, 020100 and 020200 first';
  END IF;
  IF to_regclass('public.export_jobs') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123030000_platform_notification_outbox needs export_jobs: apply 20261123020400_platform_export_jobs.sql first';
  END IF;
  IF to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL OR to_regclass('public.account_memberships') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123030000_platform_notification_outbox needs the reach helpers: apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.is_company_actor(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123030000_platform_notification_outbox needs is_company_actor(): apply 20261123000400_platform_capabilities.sql first';
  END IF;
  IF to_regprocedure('public.vessel_module_on_internal(uuid,text,date)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123030000_platform_notification_outbox needs vessel_module_on_internal(): apply 20261123000500_platform_module_settings.sql first';
  END IF;
  IF to_regclass('public.notification_types') IS NULL OR to_regclass('public.user_notification_preferences') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123030000_platform_notification_outbox needs the live notification_types and user_notification_preferences tables';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  type_key text NOT NULL,
  module_key text NULL,
  title text NOT NULL,
  body text NULL,
  severity text NOT NULL DEFAULT 'info',
  link_scope text NOT NULL,
  link_vessel_code text NULL,
  link_workspace text NULL,
  link_path text NULL,
  record_kind text NULL,
  record_id uuid NULL,
  record_ref text NULL,
  envelope_id uuid NULL,
  actor_user_id uuid NULL,
  must_act_user_ids uuid[] NOT NULL DEFAULT '{}',
  audience text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  CONSTRAINT notification_outbox_pkey PRIMARY KEY (id),
  CONSTRAINT notification_outbox_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT notification_outbox_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE SET NULL,
  CONSTRAINT notification_outbox_type_key_fkey FOREIGN KEY (type_key) REFERENCES public.notification_types(key) ON DELETE RESTRICT,
  CONSTRAINT notification_outbox_envelope_id_fkey FOREIGN KEY (envelope_id) REFERENCES public.record_envelopes(id) ON DELETE SET NULL,
  CONSTRAINT notification_outbox_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT notification_outbox_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT notification_outbox_body_check CHECK (body IS NULL OR length(body) <= 280),
  CONSTRAINT notification_outbox_severity_check CHECK (severity IN ('info', 'success', 'warning', 'critical')),
  CONSTRAINT notification_outbox_link_scope_check CHECK (link_scope IN ('fleet', 'vessel', 'workspace', 'personal')),
  CONSTRAINT notification_outbox_link_workspace_check CHECK (link_workspace IS NULL OR link_workspace IN ('hris', 'health', 'yard', 'shoreside', 'legal')),
  CONSTRAINT notification_outbox_link_shape_check CHECK ((link_scope = 'vessel') = (link_vessel_code IS NOT NULL) AND (link_scope = 'workspace') = (link_workspace IS NOT NULL)),
  CONSTRAINT notification_outbox_link_vessel_code_check CHECK (link_vessel_code IS NULL OR link_vessel_code ~ '^[A-Z][A-Z0-9]{2}$'),
  CONSTRAINT notification_outbox_link_path_check CHECK (link_path IS NULL OR (length(link_path) BETWEEN 1 AND 500 AND link_path !~* '(^/)|(\.\.)|(//)|(\\)|(^[A-Za-z][A-Za-z0-9+.-]*:)|(%2e)|([[:cntrl:]])')),
  CONSTRAINT notification_outbox_audience_check CHECK (audience <@ ARRAY['must_act', 'vessel_members', 'owner_admins', 'fleet_reach', 'dpa']::text[]),
  CONSTRAINT notification_outbox_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT notification_outbox_attempts_check CHECK (attempts >= 0),
  CONSTRAINT notification_outbox_last_error_check CHECK (last_error IS NULL OR last_error ~ '^[a-z][a-z0-9_]{0,63}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_key ON public.notification_outbox (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending ON public.notification_outbox (created_at) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.notification_inbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  type_key text NOT NULL,
  module_key text NULL,
  title text NOT NULL,
  body text NULL,
  severity text NOT NULL,
  link_scope text NOT NULL,
  link_vessel_code text NULL,
  link_workspace text NULL,
  link_path text NULL,
  record_kind text NULL,
  record_id uuid NULL,
  record_ref text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_inbox_pkey PRIMARY KEY (id),
  CONSTRAINT notification_inbox_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES public.notification_outbox(id) ON DELETE CASCADE,
  CONSTRAINT notification_inbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT notification_inbox_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT notification_inbox_outbox_user_key UNIQUE (outbox_id, user_id),
  CONSTRAINT notification_inbox_severity_check CHECK (severity IN ('info', 'success', 'warning', 'critical')),
  CONSTRAINT notification_inbox_link_scope_check CHECK (link_scope IN ('fleet', 'vessel', 'workspace', 'personal')),
  -- the same link checks as the outbox (CC-13): the TS row type mirrors them, and fan-out copies the values
  CONSTRAINT notification_inbox_link_workspace_check CHECK (link_workspace IS NULL OR link_workspace IN ('hris', 'health', 'yard', 'shoreside', 'legal')),
  CONSTRAINT notification_inbox_link_vessel_code_check CHECK (link_vessel_code IS NULL OR link_vessel_code ~ '^[A-Z][A-Z0-9]{2}$'),
  CONSTRAINT notification_inbox_link_path_check CHECK (link_path IS NULL OR (length(link_path) BETWEEN 1 AND 500 AND link_path !~* '(^/)|(\.\.)|(//)|(\\)|(^[A-Za-z][A-Za-z0-9+.-]*:)|(%2e)|([[:cntrl:]])'))
);

CREATE INDEX IF NOT EXISTS idx_notification_inbox_user ON public.notification_inbox (user_id, archived_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_inbox_unread ON public.notification_inbox (user_id) WHERE read_at IS NULL AND archived_at IS NULL;

-- ---------------------------------------------------------------- grants and RLS

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_outbox FROM anon, authenticated;
GRANT ALL ON TABLE public.notification_outbox TO service_role;

DROP POLICY IF EXISTS notification_outbox_service ON public.notification_outbox;
CREATE POLICY notification_outbox_service ON public.notification_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.notification_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_inbox FROM anon, authenticated;
GRANT SELECT ON TABLE public.notification_inbox TO authenticated;
GRANT UPDATE (read_at, archived_at) ON TABLE public.notification_inbox TO authenticated;
GRANT ALL ON TABLE public.notification_inbox TO service_role;

DROP POLICY IF EXISTS notification_inbox_select_own ON public.notification_inbox;
CREATE POLICY notification_inbox_select_own ON public.notification_inbox
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()));

DROP POLICY IF EXISTS notification_inbox_update_own ON public.notification_inbox;
CREATE POLICY notification_inbox_update_own ON public.notification_inbox
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()))
  WITH CHECK (user_id = auth.uid());

-- Realtime (RLS applies to realtime): the bell subscribes to its own rows.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_inbox;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------- outbox guard

-- The outbox is append-only except its processing state (processed_at,
-- attempts, last_error), which only the definers below change.
CREATE OR REPLACE FUNCTION public.notification_outbox_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['processed_at', 'attempts', 'last_error']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['processed_at', 'attempts', 'last_error']) THEN
    IF (to_jsonb(NEW) - ARRAY['processed_at', 'attempts', 'last_error', 'vessel_id', 'envelope_id', 'actor_user_id'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['processed_at', 'attempts', 'last_error', 'vessel_id', 'envelope_id', 'actor_user_id'])
       AND (NEW.vessel_id IS NULL OR NEW.vessel_id = OLD.vessel_id)
       AND (NEW.envelope_id IS NULL OR NEW.envelope_id = OLD.envelope_id)
       AND (NEW.actor_user_id IS NULL OR NEW.actor_user_id = OLD.actor_user_id) THEN
      RETURN NEW; -- a referential SET NULL (deleted vessel, record or user)
    END IF;
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'notification_outbox_is_append_only', DETAIL = 'Only the processing state of an outbox row changes.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_outbox_guard ON public.notification_outbox;
CREATE TRIGGER trg_notification_outbox_guard
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.notification_outbox_guard();

-- ---------------------------------------------------------------- recipients and fan-out

-- notification_recipients: must-act users and the audience of an outbox
-- row, de-duplicated, then filtered: active, a profile in the event's
-- company, reach to the event's vessel (or fleet reach, or a company actor)
-- / fleet reach (or a company actor) for a fleet link, never the actor, the
-- in-app preference (else the type's default) respected, and the event's
-- module on for its vessel (vessel_module_on_internal; a personal-scope
-- link, a fleet event or one without a module key is not gated; review
-- round 5). Internal reach and module functions throughout (rule 12): it
-- runs inside the actor's transaction.
CREATE OR REPLACE FUNCTION public.notification_recipients(p_outbox_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH o AS (
    SELECT * FROM public.notification_outbox WHERE id = p_outbox_id
  ),
  candidates AS (
    SELECT unnest(o.must_act_user_ids) AS user_id FROM o
    UNION
    SELECT p.user_id
    FROM o
    JOIN public.profiles AS p ON p.company_id = o.company_id AND p.user_id IS NOT NULL
    WHERE ('vessel_members' = ANY (o.audience) AND o.vessel_id IS NOT NULL AND public.reach_vessel_for(p.user_id, o.vessel_id))
       OR ('owner_admins' = ANY (o.audience) AND public.is_company_actor(p.user_id, o.vessel_id))
       OR ('fleet_reach' = ANY (o.audience) AND public.fleet_reach_for(p.user_id, o.company_id))
       OR ('dpa' = ANY (o.audience) AND EXISTS (
             SELECT 1 FROM public.account_memberships AS m
             WHERE m.user_id = p.user_id AND m.company_id = o.company_id AND m.status = 'active'
               AND (m.is_dpa OR (m.legacy_managed AND p.role::text = 'dpa'))))
  )
  SELECT DISTINCT c.user_id
  FROM o
  JOIN candidates AS c ON c.user_id IS NOT NULL
  JOIN public.profiles AS pr ON pr.user_id = c.user_id AND pr.company_id = o.company_id
  JOIN public.notification_types AS t ON t.key = o.type_key
  WHERE c.user_id IS DISTINCT FROM o.actor_user_id
    AND public.user_is_active(c.user_id)
    AND CASE
          WHEN o.vessel_id IS NOT NULL THEN public.reach_vessel_for(c.user_id, o.vessel_id)
                                         OR public.fleet_reach_for(c.user_id, o.company_id)
                                         OR public.is_company_actor(c.user_id, o.vessel_id)
          WHEN o.link_scope = 'fleet' THEN public.fleet_reach_for(c.user_id, o.company_id) OR public.is_company_actor(c.user_id, NULL)
          ELSE true
        END
    AND coalesce((SELECT up.in_app_enabled FROM public.user_notification_preferences AS up
                  WHERE up.user_id = c.user_id AND up.notification_type_key = o.type_key), t.default_enabled)
    AND (o.vessel_id IS NULL OR o.module_key IS NULL OR o.link_scope = 'personal' OR public.vessel_module_on_internal(o.vessel_id, o.module_key))
$$;

-- notification_fan_out: one inbox row per recipient (title, body, severity
-- and link fields copied), then processed_at. An already processed row
-- fans out nothing. Returns the number of inbox rows written.
CREATE OR REPLACE FUNCTION public.notification_fan_out(p_outbox_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.notification_outbox;
  v_count integer;
BEGIN
  SELECT * INTO o FROM public.notification_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'notification_not_found';
  END IF;
  IF o.processed_at IS NOT NULL THEN
    RETURN 0;
  END IF;
  INSERT INTO public.notification_inbox (outbox_id, user_id, company_id, vessel_id, type_key, module_key, title, body, severity,
                                         link_scope, link_vessel_code, link_workspace, link_path, record_kind, record_id, record_ref, payload)
  SELECT o.id, r.user_id, o.company_id, o.vessel_id, o.type_key, o.module_key, o.title, o.body, o.severity,
         o.link_scope, o.link_vessel_code, o.link_workspace, o.link_path, o.record_kind, o.record_id, o.record_ref, o.payload
  FROM public.notification_recipients(o.id) AS r(user_id)
  ON CONFLICT (outbox_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.notification_outbox SET processed_at = now(), last_error = NULL WHERE id = o.id;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------- emit

-- emit_notification_event (service role; definers call it, the browser
-- cannot): validates the type, the company, the vessel (of that company)
-- and the envelope (of that company and vessel); with a JWT caller, the
-- caller is an active member of the company who reaches the vessel (fleet
-- reach counts) or is a company actor (fleet-level: any active member).
-- link_vessel_code is the vessel's stored code (never the caller's);
-- actor_user_id is auth.uid(). Dedupe on (company, dedupe_key): the
-- existing id comes back and nothing fans out again. Then the inline
-- fan-out in an exception block (D-128).
CREATE OR REPLACE FUNCTION public.emit_notification_event(
  p_type_key text,
  p_company_id uuid,
  p_title text,
  p_link_scope text,
  p_vessel_id uuid DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_severity text DEFAULT 'info',
  p_link_path text DEFAULT NULL,
  p_link_workspace text DEFAULT NULL,
  p_record_kind text DEFAULT NULL,
  p_record_id uuid DEFAULT NULL,
  p_record_ref text DEFAULT NULL,
  p_envelope_id uuid DEFAULT NULL,
  p_must_act_user_ids uuid[] DEFAULT '{}'::uuid[],
  p_audience text[] DEFAULT '{}'::text[],
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_dedupe_key text DEFAULT NULL,
  p_module_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vessel_company uuid;
  v_code text;
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_must uuid[] := array_remove(coalesce(p_must_act_user_ids, '{}'::uuid[]), NULL);
  v_audience text[] := coalesce(p_audience, '{}'::text[]);
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_severity text := coalesce(p_severity, 'info');
BEGIN
  IF p_type_key IS NULL OR NOT EXISTS (SELECT 1 FROM public.notification_types AS t WHERE t.key = p_type_key) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unknown_notification_type';
  END IF;
  IF p_company_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.companies AS c WHERE c.id = p_company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'company_invalid';
  END IF;
  IF p_vessel_id IS NOT NULL THEN
    SELECT v.company_id, v.code INTO v_vessel_company, v_code FROM public.vessels AS v WHERE v.id = p_vessel_id;
    IF v_vessel_company IS DISTINCT FROM p_company_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_invalid';
    END IF;
  END IF;
  IF p_envelope_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.record_envelopes AS e WHERE e.id = p_envelope_id AND e.company_id = p_company_id AND e.vessel_id IS NOT DISTINCT FROM p_vessel_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'envelope_invalid';
  END IF;
  IF v_uid IS NOT NULL THEN
    IF NOT public.user_belongs_to_company(v_uid, p_company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'notification_emit_denied';
    END IF;
    IF p_vessel_id IS NOT NULL AND NOT (public.reach_vessel_for(v_uid, p_vessel_id) OR public.fleet_reach_for(v_uid, p_company_id)
                                        OR public.is_company_actor(v_uid, p_vessel_id)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'notification_emit_denied';
    END IF;
  END IF;
  IF v_title = '' OR length(v_title) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'title_invalid';
  END IF;
  IF v_body IS NOT NULL AND length(v_body) > 280 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'body_too_long';
  END IF;
  IF v_severity NOT IN ('info', 'success', 'warning', 'critical') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'severity_invalid';
  END IF;
  IF p_link_scope IS NULL OR p_link_scope NOT IN ('fleet', 'vessel', 'workspace', 'personal')
     OR (p_link_scope = 'vessel' AND v_code IS NULL)
     OR ((p_link_scope = 'workspace') <> (p_link_workspace IS NOT NULL))
     OR (p_link_workspace IS NOT NULL AND p_link_workspace NOT IN ('hris', 'health', 'yard', 'shoreside', 'legal'))
     OR (p_link_path IS NOT NULL AND (length(p_link_path) NOT BETWEEN 1 AND 500
         OR p_link_path ~* '(^/)|(\.\.)|(//)|(\\)|(^[A-Za-z][A-Za-z0-9+.-]*:)|(%2e)|([[:cntrl:]])')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'link_invalid';
  END IF;
  IF (p_record_kind IS NOT NULL AND p_record_kind !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
     OR (p_record_ref IS NOT NULL AND length(p_record_ref) > 120) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'record_invalid';
  END IF;
  IF NOT (v_audience <@ ARRAY['must_act', 'vessel_members', 'owner_admins', 'fleet_reach', 'dpa']::text[]) OR array_position(v_audience, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'audience_invalid';
  END IF;
  IF jsonb_typeof(v_payload) <> 'object' OR length(v_payload::text) > 8000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid';
  END IF;
  IF p_dedupe_key IS NOT NULL AND length(p_dedupe_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'dedupe_key_invalid';
  END IF;
  IF p_module_key IS NOT NULL AND p_module_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'module_key_invalid';
  END IF;

  INSERT INTO public.notification_outbox (company_id, vessel_id, type_key, module_key, title, body, severity, link_scope, link_vessel_code,
                                          link_workspace, link_path, record_kind, record_id, record_ref, envelope_id, actor_user_id,
                                          must_act_user_ids, audience, payload, dedupe_key)
  VALUES (p_company_id, p_vessel_id, p_type_key, p_module_key, v_title, v_body, v_severity, p_link_scope,
          CASE WHEN p_link_scope = 'vessel' THEN v_code END, p_link_workspace, p_link_path, p_record_kind, p_record_id, p_record_ref,
          p_envelope_id, v_uid, v_must, v_audience, v_payload, p_dedupe_key)
  ON CONFLICT (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT o.id INTO v_id FROM public.notification_outbox AS o WHERE o.company_id = p_company_id AND o.dedupe_key = p_dedupe_key;
    RETURN v_id;
  END IF;

  BEGIN
    PERFORM public.notification_fan_out(v_id);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.notification_outbox SET attempts = attempts + 1, last_error = left('fan_out_' || lower(SQLSTATE), 64) WHERE id = v_id;
  END;
  RETURN v_id;
END;
$$;

-- process_notification_outbox (service role; for a later cron): retries
-- unprocessed rows with fewer than 5 attempts, oldest first, skipping rows
-- another worker holds. A failure counts an attempt and keeps the row.
-- Returns the number of rows processed.
CREATE OR REPLACE FUNCTION public.process_notification_outbox(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_done integer := 0;
BEGIN
  FOR r IN
    SELECT o.id FROM public.notification_outbox AS o
    WHERE o.processed_at IS NULL AND o.attempts < 5
    ORDER BY o.created_at, o.id
    LIMIT greatest(coalesce(p_limit, 100), 0)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.notification_fan_out(r.id);
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.notification_outbox SET attempts = attempts + 1, last_error = left('fan_out_' || lower(SQLSTATE), 64) WHERE id = r.id;
    END;
  END LOOP;
  RETURN v_done;
END;
$$;

-- notification_inbox_mark_all_read: the caller's own unread, unarchived
-- rows created at or before p_before become read. INVOKER: it runs under
-- the inbox's RLS and column grants (a disabled user updates 0 rows).
CREATE OR REPLACE FUNCTION public.notification_inbox_mark_all_read(p_before timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE public.notification_inbox
  SET read_at = now()
  WHERE user_id = v_uid AND read_at IS NULL AND archived_at IS NULL AND created_at <= coalesce(p_before, now());
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------- record-engine wiring

-- record_event_notify (trigger on record_events rows with a notification
-- type): title (reference + what happened, no names) and body (the kind)
-- cut to 120 / 280, deep link (vessel code or fleet; record kind + id),
-- audience and severity per spec §A.15, dedupe 'event:<id>'. Never rolls
-- back the engine action: any error becomes a WARNING (CC-16).
CREATE OR REPLACE FUNCTION public.record_event_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := NEW.notification_type;
  v_label text;
  v_subject text;
  v_title text;
  v_body text;
  v_severity text := 'info';
  v_audience text[] := '{}'::text[];
  v_must uuid[] := '{}'::uuid[];
  v_opened_by uuid;
  v_scope text;
  v_record_kind text;
  v_record_id uuid;
  v_job public.export_jobs;
  v_payload_must uuid[] := '{}'::uuid[];
BEGIN
  BEGIN
    IF NEW.envelope_id IS NOT NULL THEN
      SELECT e.opened_by INTO v_opened_by FROM public.record_envelopes AS e WHERE e.id = NEW.envelope_id;
    END IF;
    IF NEW.kind_key IS NOT NULL THEN
      SELECT k.label INTO v_label FROM public.record_kinds AS k WHERE k.key = NEW.kind_key;
    END IF;
    IF jsonb_typeof(NEW.payload -> 'must_act_user_ids') = 'array' THEN
      v_payload_must := ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(NEW.payload -> 'must_act_user_ids') AS x);
    END IF;
    v_subject := coalesce(NEW.reference, v_label, 'A record');
    v_body := v_label;
    v_scope := CASE WHEN NEW.vessel_id IS NOT NULL THEN 'vessel' ELSE 'fleet' END;
    v_record_kind := NEW.kind_key;
    v_record_id := CASE WHEN NEW.kind_key IS NOT NULL THEN coalesce(NEW.entity_id, NEW.envelope_id) END;

    CASE v_type
      WHEN 'record_submitted_to_company' THEN
        v_title := v_subject || ' submitted to the company';
        v_audience := ARRAY['owner_admins'];
        v_severity := 'warning';
      WHEN 'record_acknowledged', 'record_closed', 'record_decision', 'record_reopened' THEN
        v_title := v_subject || CASE v_type
          WHEN 'record_acknowledged' THEN ' acknowledged by the company'
          WHEN 'record_closed' THEN ' closed'
          WHEN 'record_reopened' THEN ' reopened'
          ELSE CASE NEW.payload ->> 'decision'
            WHEN 'approved' THEN ' approved by the company'
            WHEN 'approved_with_conditions' THEN ' approved with conditions'
            WHEN 'not_approved' THEN ' not approved by the company'
            ELSE ': company decision recorded' END
        END;
        v_must := ARRAY[v_opened_by] || ARRAY(
          SELECT DISTINCT s.signer_user_id FROM public.record_signatures AS s
          WHERE s.envelope_id = NEW.envelope_id AND s.cycle = NEW.cycle AND s.removed_at IS NULL AND s.signer_user_id IS NOT NULL);
        v_severity := CASE WHEN v_type = 'record_decision' AND NEW.payload ->> 'decision' = 'not_approved' THEN 'warning' ELSE 'info' END;
      WHEN 'record_returned' THEN
        v_title := v_subject || ' returned to the vessel';
        v_must := ARRAY[v_opened_by] || ARRAY(
          SELECT DISTINCT s.signer_user_id FROM public.record_signatures AS s
          WHERE s.envelope_id = NEW.envelope_id AND s.cycle = NEW.cycle AND s.party = 'vessel' AND s.removed_at IS NULL AND s.signer_user_id IS NOT NULL);
        v_severity := 'warning';
      WHEN 'record_voided' THEN
        v_title := v_subject || ' voided';
        v_audience := ARRAY['owner_admins'];
        v_must := ARRAY[v_opened_by];
      WHEN 'signature_requested' THEN
        v_title := 'Your signature is requested on ' || v_subject;
        v_must := v_payload_must;
        v_severity := 'warning';
      WHEN 'record_update_posted' THEN
        v_title := 'New update on ' || v_subject;
        v_audience := CASE WHEN NEW.party = 'company' THEN ARRAY['vessel_members'] ELSE ARRAY['owner_admins'] END;
      WHEN 'status_request_posted' THEN
        v_title := 'The company asked for an update on ' || v_subject;
        v_must := ARRAY[v_opened_by];
        v_severity := 'warning';
      WHEN 'export_ready', 'export_failed' THEN
        SELECT * INTO v_job FROM public.export_jobs AS j WHERE j.id = NEW.entity_id AND NEW.entity_type = 'export_job';
        v_title := CASE v_type WHEN 'export_ready' THEN 'Your export is ready' ELSE 'Your export could not be completed' END;
        v_body := CASE v_job.kind
          WHEN 'record_pdf' THEN 'Record PDF' WHEN 'register_pdf' THEN 'Register PDF' WHEN 'csv' THEN 'CSV file'
          WHEN 'xlsx' THEN 'Excel file' WHEN 'zip' THEN 'ZIP archive' WHEN 'compliance_pack' THEN 'Compliance pack'
          WHEN 'gdpr_subject' THEN 'Personal data export' WHEN 'ics' THEN 'Calendar file' ELSE 'Export' END
          || coalesce(' · ' || v_job.source_key, '');
        v_must := ARRAY[v_job.requested_by];
        v_severity := CASE v_type WHEN 'export_ready' THEN 'info' ELSE 'warning' END;
        v_scope := 'personal';
        v_record_kind := NULL;
        v_record_id := NULL;
      ELSE
        v_title := v_subject || ' updated';
        v_must := v_payload_must;
    END CASE;

    v_must := array_remove(v_must, NULL);
    IF cardinality(v_must) > 0 OR cardinality(v_audience) > 0 THEN
      PERFORM public.emit_notification_event(
        p_type_key := v_type,
        p_company_id := NEW.company_id,
        p_title := btrim(left(v_title, 120)),
        p_link_scope := v_scope,
        p_vessel_id := NEW.vessel_id,
        p_body := left(v_body, 280),
        p_severity := v_severity,
        p_record_kind := v_record_kind,
        p_record_id := v_record_id,
        p_record_ref := left(NEW.reference, 120),
        p_envelope_id := NEW.envelope_id,
        p_must_act_user_ids := v_must,
        p_audience := v_audience,
        p_payload := jsonb_strip_nulls(jsonb_build_object(
          'event_id', NEW.id, 'action', NEW.action, 'envelope_id', NEW.envelope_id, 'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id, 'cycle', NEW.cycle, 'decision', NEW.payload ->> 'decision', 'party', NEW.party)),
        p_dedupe_key := 'event:' || NEW.id::text,
        p_module_key := NEW.module_key);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notification_emit_failed: %', SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_events_emit ON public.record_events;
CREATE TRIGGER trg_record_events_emit
  AFTER INSERT ON public.record_events
  FOR EACH ROW
  WHEN (NEW.notification_type IS NOT NULL)
  EXECUTE FUNCTION public.record_event_notify();

-- record_event_notify_personal_data (D-238; review round 6,
-- seeded-notification-types-no-emitter; gap/08 §N: personal_data_exported
-- is immediate to the DPA for any export flagged personal): a second
-- AFTER INSERT trigger on record_events, for an export_job event logged
-- (a browser export, log_client_export) or made ready (a server export,
-- export_job_transition) whose payload says contains_personal_data. It
-- does not overload export_job_log's single notification type: an
-- export.ready row still notifies its requester with export_ready
-- (trg_record_events_emit), and this one adds the DPA notice. Audience
-- 'dpa' (notification_recipients: an active membership with is_dpa, or a
-- legacy-managed one whose profile role is dpa), link_scope 'fleet' with
-- no vessel, so no vessel's module-off rule suppresses it; never the actor
-- (the DPA who exports gets no notice of their own export). For a fleet
-- link notification_recipients also asks fleet reach or a company actor:
-- a legacy dpa has fleet reach, but a non-legacy is_dpa membership without
-- fleet_access that is neither admin nor owner is dropped (D-238; such a
-- DPA should hold fleet access). Title without names, body the export kind
-- (as export_ready labels it) and the source key, ids-only payload, dedupe
-- 'pde:<event id>'. Never rolls back the export (CC-16): a failure is a
-- WARNING, and the WHEN clause compares jsonb (payload ->
-- 'contains_personal_data' = 'true'), so an odd payload value never raises
-- a cast error into the export. No grant (a trigger function).
CREATE OR REPLACE FUNCTION public.record_event_notify_personal_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := NEW.payload ->> 'kind';
  v_body text;
BEGIN
  BEGIN
    v_body := CASE v_kind
      WHEN 'record_pdf' THEN 'Record PDF' WHEN 'register_pdf' THEN 'Register PDF' WHEN 'csv' THEN 'CSV file'
      WHEN 'xlsx' THEN 'Excel file' WHEN 'zip' THEN 'ZIP archive' WHEN 'compliance_pack' THEN 'Compliance pack'
      WHEN 'gdpr_subject' THEN 'Personal data export' WHEN 'ics' THEN 'Calendar file' ELSE 'Export' END
      || coalesce(' · ' || (NEW.payload ->> 'source_key'), '');
    PERFORM public.emit_notification_event(
      p_type_key := 'personal_data_exported',
      p_company_id := NEW.company_id,
      p_title := 'Personal data exported',
      p_link_scope := 'fleet',
      p_vessel_id := NULL,
      p_body := left(v_body, 280),
      p_severity := 'info',
      p_audience := ARRAY['dpa'],
      p_payload := jsonb_strip_nulls(jsonb_build_object(
        'event_id', NEW.id, 'export_job_id', NEW.entity_id, 'kind', v_kind, 'generated_by', NEW.payload ->> 'generated_by')),
      p_dedupe_key := 'pde:' || NEW.id::text,
      p_module_key := NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notification_emit_failed: %', SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_events_personal_data ON public.record_events;
CREATE TRIGGER trg_record_events_personal_data
  AFTER INSERT ON public.record_events
  FOR EACH ROW
  WHEN (NEW.entity_type = 'export_job' AND NEW.action IN ('export.logged', 'export.ready')
        AND coalesce(NEW.payload -> 'contains_personal_data' = 'true'::jsonb, false))
  EXECUTE FUNCTION public.record_event_notify_personal_data();

-- ---------------------------------------------------------------- engine notification types (gap/08 §N, gap/03 catalogue)

INSERT INTO public.notification_types (key, name, category, cadence, description, default_enabled, sort_order) VALUES
  ('signature_requested', 'Signature requested', 'Records', 'realtime', 'A record is waiting for your signature', true, 300),
  ('signature_reminder', 'Signature reminder', 'Records', 'daily', 'A record still needs your signature', true, 301),
  ('signatures_stale', 'Signatures out of date', 'Records', 'realtime', 'A record changed after it was signed, so its signatures need renewing', true, 302),
  ('record_submitted_to_company', 'Record submitted to the company', 'Records', 'realtime', 'A vessel record is ready for the company', true, 310),
  ('record_acknowledged', 'Record acknowledged', 'Records', 'realtime', 'The company acknowledged a record you worked on', true, 311),
  ('record_decision', 'Company decision', 'Records', 'realtime', 'The company recorded its decision on a record you worked on', true, 312),
  ('record_returned', 'Record returned to the vessel', 'Records', 'realtime', 'The company sent a record back to the vessel with a request', true, 313),
  ('record_closed', 'Record closed', 'Records', 'realtime', 'A record you worked on was closed', true, 314),
  ('record_reopened', 'Record reopened', 'Records', 'realtime', 'A record you worked on was reopened', true, 315),
  ('record_voided', 'Record voided', 'Records', 'realtime', 'A record was voided', true, 316),
  ('record_update_posted', 'Record update', 'Records', 'realtime', 'A new update was posted on a record', true, 320),
  ('status_request_posted', 'Update requested', 'Records', 'realtime', 'The company asked for an update on a record', true, 321),
  ('status_request_due', 'Requested update due', 'Records', 'daily', 'An update the company asked for is due today', true, 322),
  ('status_request_overdue', 'Requested update overdue', 'Records', 'daily', 'An update the company asked for is past its due date', true, 323),
  ('export_ready', 'Export ready', 'Records', 'realtime', 'An export you asked for is ready to download', true, 330),
  ('export_failed', 'Export failed', 'Records', 'realtime', 'An export you asked for could not be completed', true, 331),
  ('personal_data_exported', 'Personal data exported', 'Records', 'realtime', 'An export containing personal data was made', true, 332),
  ('invitation_accepted', 'Invitation accepted', 'Records', 'realtime', 'Someone you invited has joined STORM', true, 340),
  ('invitation_bounced', 'Invitation not delivered', 'Records', 'realtime', 'An invitation email could not be delivered', true, 341)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.notification_outbox_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notification_recipients(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notification_fan_out(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.emit_notification_event(text, uuid, text, text, uuid, text, text, text, text, text, uuid, text, uuid, uuid[], text[], jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_notification_outbox(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notification_inbox_mark_all_read(timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_event_notify() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_event_notify_personal_data() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.notification_recipients(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_fan_out(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_notification_event(text, uuid, text, text, uuid, text, text, text, text, text, uuid, text, uuid, uuid[], text[], jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_notification_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_inbox_mark_all_read(timestamptz) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.notification_outbox IS 'One row per notification event (gap/08 NO6; gap/03 C1; proposed D-127): type, company, vessel, title, link, must-act users, audience, ids-only payload, dedupe key, processing state. Service role only (the browser never reads it). Append-only except processed_at / attempts / last_error (no updated_at: rule 3 exception).';
COMMENT ON TABLE public.notification_inbox IS 'One row per recipient of an outbox event (gap/03 C9, C11; D-62): what the bell and /inbox show. A user reads and updates only their own rows, and only read_at / archived_at (column grants); rows are written by notification_fan_out only. No updated_at (rule 3 exception: the two timestamps are the history). In the supabase_realtime publication (RLS applies).';
COMMENT ON FUNCTION public.notification_outbox_guard() IS 'Trigger: an outbox row never changes except its processing state (and referential set-null).';
COMMENT ON FUNCTION public.notification_recipients(uuid) IS 'Internal: the recipients of an outbox row (must-act + audience), filtered to active users of the company with reach (or company actors), without the actor, preferences respected; nobody when the event''s module is off on its vessel (vessel_module_on_internal; personal-scope links exempt; gap/01 W6, D-162). Uses the internal reach and module functions (rule 12).';
COMMENT ON FUNCTION public.notification_fan_out(uuid) IS 'Internal: one inbox row per recipient of an outbox row, then processed_at. Returns the count.';
COMMENT ON FUNCTION public.emit_notification_event(text, uuid, text, text, uuid, text, text, text, text, text, uuid, text, uuid, uuid[], text[], jsonb, text, text) IS 'Emits one notification event (service role; definers call it): validates type, company, vessel, envelope and the caller, stores the vessel code, dedupes, fans out inline in an exception block (D-128). Returns the outbox id.';
COMMENT ON FUNCTION public.process_notification_outbox(integer) IS 'Retry processor (service role; for a later cron): fans out unprocessed outbox rows with fewer than 5 attempts (FOR UPDATE SKIP LOCKED).';
COMMENT ON FUNCTION public.notification_inbox_mark_all_read(timestamptz) IS 'Marks the caller''s own unread, unarchived inbox rows up to p_before as read; returns the count (0 for a disabled user).';
COMMENT ON FUNCTION public.record_event_notify() IS 'Trigger on record_events: emits the event''s notification (title, link, audience, severity of spec §A.15); never rolls back the engine action (WARNING on failure, CC-16).';
COMMENT ON FUNCTION public.record_event_notify_personal_data() IS 'Trigger trg_record_events_personal_data on record_events (D-238; gap/08 §N): an export_job event export.logged or export.ready whose payload has contains_personal_data true emits personal_data_exported to the company''s DPA (audience dpa: an active is_dpa membership or a legacy dpa profile; link_scope fleet, no vessel, so no module-off rule suppresses it; never the actor; a fleet link also needs fleet reach or a company actor, so a non-legacy is_dpa membership without fleet_access that is neither admin nor owner is not notified). Title Personal data exported, body the export kind and source key, ids-only payload, dedupe pde:<event id>. Never rolls back the export (WARNING notification_emit_failed, CC-16). No grant.';
