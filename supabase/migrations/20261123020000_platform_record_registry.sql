-- =================================================================
-- PLATFORM P4: record engine, unit 1/3: registry, envelopes, events,
-- snapshots, the transition engine (gap/08 REG1-3, AU1-2, SN1, §A, §C;
-- DECISIONS G7, D-30, D-32, D-50, D-51; Phase 2 spec §A.10, CC-15, CC-18;
-- proposed D-132)
-- Tables: record_kinds (platform catalogue), record_envelopes,
--   record_events (append-only), record_snapshots (append-only)
-- Helpers: record_text_blank(), record_json_truthy(),
--   record_slot_template_valid(), record_digest_of(), record_readable(),
--   record_transition_decide() (pure mirror of transitionEnvelope()),
--   record_vessel_signatures_locked() (pure mirror of
--   vesselSignaturesLocked()), record_state_of(), record_open_requests(),
--   record_vessel_slots_complete(), record_stale_required(),
--   record_caller_reaches(), record_user_is_external(),
--   record_caller_may_write(), record_impersonating(), record_engine_apply(),
--   record_whose_move(), record_open_envelope(), record_transition(),
--   record_set_section_digests(), record_slot_digest(), record_log_event()
-- TS mirror: src/lib/records/services/db.pending.ts (RecordsPendingTables
--   record_kinds / record_envelopes / record_events / record_snapshots,
--   RecordsPendingFunctions record_open_envelope / record_transition_decide /
--   record_transition); the pure engines src/lib/records/companyStep.ts and
--   whoseMove.ts (frozen in Phase 2)
-- Parity: supabase/tests/fixtures/record-transitions.json and
--   record-vessel-lock.json (scripts/db/gen-record-fixtures.mjs), asserted
--   by supabase/tests/sql/p4_registry
-- =================================================================
--
-- Files 20261123020000 (this), 20261123020100 (signatures) and
-- 20261123020200 (threads) are ONE UNIT (CC-18): apply them together, in
-- order, in one sitting. plpgsql bodies here refer to tables and functions
-- of the other two files with static SQL (resolved when they run): before
-- those files exist such a call raises and rolls back (fail closed). There
-- is no to_regclass / EXECUTE branching inside the unit.
--
-- Status changes only through the engine (D-132): trg_record_envelopes_guard
-- refuses any change of a status column, and any delete, unless the
-- transaction-local flag storm.record_engine is on. The flag is set (and
-- reset before returning) by the engine definers only; the guard holds for
-- the service role too. record_transition_decide() is the pure SQL mirror
-- of transitionEnvelope(); record_transition() derives the party and every
-- guard (open requests, stale signatures, all vessel slots signed)
-- server-side, never from the payload, and applies the outcome's effects.
--
-- Write access (review round 4, record-engine-external-writes): reading a
-- record is record_readable(); changing one as the vessel party (open,
-- transition, thread post, sign, pass, attach, link) needs
-- record_caller_may_write(): reach to the record (its vessel, or fleet
-- reach) and no external membership in the company (gap/01 F36, D-123: an
-- external viewer is view-only). A company actor (is_company_actor) acts as
-- the company. Module capabilities per kind (capability_path, required on
-- every kind) are not evaluated yet (D-132; BUILD-PLAN open item).
--
-- Errors: a business refusal is a result envelope {ok:false, error:{code,
-- message}} and writes nothing; authorisation failures raise 42501 (P0002
-- for an unknown id).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.format_reference(text,uuid,uuid,date)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020000_platform_record_registry needs format_reference(): apply 20261123000600_platform_format_reference.sql first';
  END IF;
  IF to_regprocedure('public.is_company_actor(uuid,uuid)') IS NULL OR to_regprocedure('public.has_capability(text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020000_platform_record_registry needs is_company_actor() and has_capability(): apply 20261123000400_platform_capabilities.sql first';
  END IF;
  IF to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_can_reach_vessel(uuid,uuid)') IS NULL OR to_regprocedure('public.user_has_fleet_reach(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020000_platform_record_registry needs the reach helpers: apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.profiles_guard_access_columns()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020000_platform_record_registry needs the active-aware helpers: apply 20261123010000_platform_user_status.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- pure helpers

-- JS blankness (`!s || !s.trim()`): NULL, or nothing but JS whitespace.
CREATE OR REPLACE FUNCTION public.record_text_blank(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT p_text IS NULL OR p_text ~ '^[\u0009-\u000d    -     　﻿]*$'
$$;

-- JS truthiness of a JSON value (absent / null / false / 0 / '' are false).
CREATE OR REPLACE FUNCTION public.record_json_truthy(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE jsonb_typeof(p_value)
    WHEN 'boolean' THEN p_value = 'true'::jsonb
    WHEN 'number' THEN (p_value #>> '{}')::numeric <> 0
    WHEN 'string' THEN (p_value #>> '{}') <> ''
    WHEN 'object' THEN true
    WHEN 'array' THEN true
    ELSE false
  END
$$;

-- validateSlotTemplate() (signatures.ts) on the snake_case template, plus
-- "company slots need a company step" (validateRecordKind). Truly
-- immutable (no table reads): it backs a CHECK constraint.
CREATE OR REPLACE FUNCTION public.record_slot_template_valid(p_template jsonb, p_company_step text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  e jsonb;
  v_keys text[] := '{}';
  v_key text;
  v_party text;
  v_flag text;
  x jsonb;
BEGIN
  IF p_template IS NULL OR jsonb_typeof(p_template) <> 'array' THEN
    RETURN false;
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_template) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RETURN false; END IF;
    v_key := e ->> 'key';
    IF jsonb_typeof(e -> 'key') IS DISTINCT FROM 'string' OR v_key !~ '^[a-z][a-z0-9_]*$' OR v_key = ANY (v_keys) THEN RETURN false; END IF;
    v_keys := v_keys || v_key;
    IF jsonb_typeof(e -> 'order') IS DISTINCT FROM 'number' OR (e ->> 'order')::numeric < 1
       OR (e ->> 'order')::numeric <> trunc((e ->> 'order')::numeric) OR (e ->> 'order')::numeric > 2147483647 THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(e -> 'label') IS DISTINCT FROM 'string' OR length(btrim(e ->> 'label')) NOT BETWEEN 1 AND 80 THEN RETURN false; END IF;
    v_party := e ->> 'party';
    IF v_party IS NULL OR v_party NOT IN ('vessel', 'company') THEN RETURN false; END IF;
    -- A company slot is signed by a company actor on their own account:
    -- never witnessed, by a visitor or on someone's behalf (review round 4,
    -- company-slot-witnessed-forgery).
    IF v_party = 'company' AND (public.record_json_truthy(e -> 'allow_witnessed') OR public.record_json_truthy(e -> 'allow_visitor') OR public.record_json_truthy(e -> 'allow_on_behalf')) THEN RETURN false; END IF;
    IF v_party = 'company' AND p_company_step IS DISTINCT FROM 'acknowledge' AND p_company_step IS DISTINCT FROM 'sign_off' THEN RETURN false; END IF;
    FOREACH v_flag IN ARRAY ARRAY['required', 'allow_witnessed', 'allow_visitor', 'allow_on_behalf', 'on_behalf_reason_required'] LOOP
      IF jsonb_typeof(e -> v_flag) IS NOT NULL AND jsonb_typeof(e -> v_flag) NOT IN ('boolean', 'null') THEN RETURN false; END IF;
    END LOOP;
    IF jsonb_typeof(e -> 'office_key') IS NOT NULL AND jsonb_typeof(e -> 'office_key') <> 'null'
       AND (jsonb_typeof(e -> 'office_key') <> 'string' OR length(btrim(e ->> 'office_key')) NOT BETWEEN 1 AND 80) THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(e -> 'named_profile_ids') IS NOT NULL AND jsonb_typeof(e -> 'named_profile_ids') <> 'null' THEN
      IF jsonb_typeof(e -> 'named_profile_ids') <> 'array' THEN RETURN false; END IF;
      FOR x IN SELECT value FROM jsonb_array_elements(e -> 'named_profile_ids') LOOP
        IF jsonb_typeof(x) <> 'string' OR (x #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
      END LOOP;
    END IF;
    IF jsonb_typeof(e -> 'covers_sections') IS NOT NULL AND jsonb_typeof(e -> 'covers_sections') <> 'null' THEN
      IF jsonb_typeof(e -> 'covers_sections') <> 'array' THEN RETURN false; END IF;
      FOR x IN SELECT value FROM jsonb_array_elements(e -> 'covers_sections') LOOP
        IF jsonb_typeof(x) <> 'string' OR ((x #>> '{}') <> '*' AND (x #>> '{}') !~ '^[a-z][a-z0-9_]*$') THEN RETURN false; END IF;
      END LOOP;
    END IF;
    IF jsonb_typeof(e -> 'distinct_from') IS NOT NULL AND jsonb_typeof(e -> 'distinct_from') <> 'null' THEN
      IF jsonb_typeof(e -> 'distinct_from') <> 'array' THEN RETURN false; END IF;
      FOR x IN SELECT value FROM jsonb_array_elements(e -> 'distinct_from') LOOP
        IF jsonb_typeof(x) <> 'string' THEN RETURN false; END IF;
      END LOOP;
    END IF;
  END LOOP;
  -- distinct_from names a known slot or 'creator'.
  FOR e IN SELECT value FROM jsonb_array_elements(p_template) LOOP
    IF jsonb_typeof(e -> 'distinct_from') = 'array' THEN
      FOR x IN SELECT value FROM jsonb_array_elements(e -> 'distinct_from') LOOP
        IF (x #>> '{}') <> 'creator' AND NOT ((x #>> '{}') = ANY (v_keys)) THEN RETURN false; END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- The digest a signature covers: sha256 (hex) of the sorted `key:digest`
-- lines of the covered sections ('*' = the whole record when none are
-- named); '' when none of them has a digest yet. Pure: the view and the
-- definers share it (scripts/db/gen-record-fixtures.mjs mirrors it).
CREATE OR REPLACE FUNCTION public.record_digest_of(p_section_digests jsonb, p_covers text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT encode(sha256(convert_to(string_agg(k || ':' || (p_section_digests ->> k), E'\n' ORDER BY k COLLATE "C"), 'UTF8')), 'hex')
    FROM unnest(CASE WHEN p_covers IS NULL OR cardinality(p_covers) = 0 THEN ARRAY['*'] ELSE p_covers END) AS k
    WHERE jsonb_typeof(p_section_digests) = 'object' AND p_section_digests ? k
    HAVING count(*) > 0
  ), '')
$$;

-- ---------------------------------------------------------------- record_kinds

CREATE TABLE IF NOT EXISTS public.record_kinds (
  key text NOT NULL,
  module_key text NOT NULL,
  label text NOT NULL,
  ref_prefix text NOT NULL,
  scope text NOT NULL,
  route_pattern text NULL,
  capability_path text NULL,
  enveloped boolean NOT NULL DEFAULT true,
  company_step text NOT NULL,
  report_first boolean NOT NULL DEFAULT false,
  decision_kind boolean NOT NULL DEFAULT false,
  allow_reopen boolean NOT NULL DEFAULT false,
  allow_close_as boolean NOT NULL DEFAULT false,
  edit_after_sign text NOT NULL,
  delete_rule text NOT NULL,
  slot_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  statuses text[] NULL,
  snapshot_on text[] NOT NULL DEFAULT '{}',
  sensitive_fields text[] NOT NULL DEFAULT '{}',
  personal_data boolean NOT NULL DEFAULT false,
  legal_privilege boolean NOT NULL DEFAULT false,
  allow_late_evidence boolean NOT NULL DEFAULT false,
  retention_years integer NULL,
  pdf_template_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_kinds_pkey PRIMARY KEY (key),
  CONSTRAINT record_kinds_ref_prefix_key UNIQUE (ref_prefix),
  CONSTRAINT record_kinds_key_check CHECK (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  CONSTRAINT record_kinds_module_key_check CHECK (module_key = split_part(key, '.', 1)),
  CONSTRAINT record_kinds_label_check CHECK (length(btrim(label)) > 0),
  CONSTRAINT record_kinds_ref_prefix_check CHECK (ref_prefix ~ '^[A-Z][A-Z0-9]{0,7}$'),
  CONSTRAINT record_kinds_scope_check CHECK (scope IN ('vessel', 'fleet')),
  CONSTRAINT record_kinds_route_pattern_check CHECK (route_pattern IS NULL OR (route_pattern LIKE '/%' AND (scope = 'fleet' OR route_pattern LIKE '/v/:vesselCode/%'))),
  CONSTRAINT record_kinds_capability_path_check CHECK (capability_path IS NOT NULL AND capability_path ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  CONSTRAINT record_kinds_company_step_check CHECK (company_step IN ('none', 'acknowledge', 'sign_off')),
  CONSTRAINT record_kinds_edit_after_sign_check CHECK (edit_after_sign IN ('allow_with_flag', 'lock', 'revert_to_draft')),
  CONSTRAINT record_kinds_delete_rule_check CHECK (delete_rule IN ('draft_only', 'never_after_submit', 'until_signed', 'free', 'cascade_parent')),
  CONSTRAINT record_kinds_step_needs_envelope CHECK (enveloped OR (company_step = 'none' AND NOT report_first AND NOT decision_kind)),
  CONSTRAINT record_kinds_report_first_step CHECK (NOT report_first OR company_step <> 'none'),
  CONSTRAINT record_kinds_decision_step CHECK (NOT decision_kind OR company_step = 'sign_off'),
  CONSTRAINT record_kinds_slot_template_check CHECK (public.record_slot_template_valid(slot_template, company_step)),
  CONSTRAINT record_kinds_retention_years_check CHECK (retention_years IS NULL OR retention_years >= 1)
);

ALTER TABLE public.record_kinds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.record_kinds FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_kinds TO authenticated;
GRANT ALL ON TABLE public.record_kinds TO service_role;

DROP TRIGGER IF EXISTS trg_record_kinds_updated_at ON public.record_kinds;
CREATE TRIGGER trg_record_kinds_updated_at
  BEFORE UPDATE ON public.record_kinds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS record_kinds_select ON public.record_kinds;
CREATE POLICY record_kinds_select ON public.record_kinds
  FOR SELECT TO authenticated
  USING (public.user_is_active(auth.uid()));

DROP POLICY IF EXISTS record_kinds_write_service ON public.record_kinds;
CREATE POLICY record_kinds_write_service ON public.record_kinds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------- record_envelopes

CREATE TABLE IF NOT EXISTS public.record_envelopes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  module_key text NOT NULL,
  kind_key text NOT NULL,
  entity_id uuid NULL,
  reference text NOT NULL,
  title text NULL,
  status text NOT NULL DEFAULT 'open',
  whose_move text NOT NULL DEFAULT 'vessel',
  closed_by_kind text NULL,
  closed_as text NULL,
  duplicate_of_envelope_id uuid NULL,
  company_decision text NULL,
  decision_conditions text NULL,
  company_acknowledged boolean NOT NULL DEFAULT false,
  company_ack_by uuid NULL,
  company_ack_at timestamptz NULL,
  initial_report_acknowledged boolean NOT NULL DEFAULT false,
  current_cycle integer NOT NULL DEFAULT 1,
  acknowledged_cycle integer NULL,
  submitted_by uuid NULL,
  submitted_at timestamptz NULL,
  closed_by_user_id uuid NULL,
  closed_at timestamptz NULL,
  section_digests jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_digest text NULL,
  last_update_at timestamptz NULL,
  follow_up_due date NULL,
  version integer NOT NULL DEFAULT 1,
  opened_by uuid NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz NULL,
  voided_by uuid NULL,
  void_reason text NULL,
  legal_hold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_envelopes_pkey PRIMARY KEY (id),
  CONSTRAINT record_envelopes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT record_envelopes_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE RESTRICT,
  CONSTRAINT record_envelopes_kind_key_fkey FOREIGN KEY (kind_key) REFERENCES public.record_kinds(key) ON DELETE RESTRICT,
  CONSTRAINT record_envelopes_duplicate_of_fkey FOREIGN KEY (duplicate_of_envelope_id) REFERENCES public.record_envelopes(id) ON DELETE SET NULL,
  CONSTRAINT record_envelopes_company_ack_by_fkey FOREIGN KEY (company_ack_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_envelopes_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_envelopes_closed_by_user_id_fkey FOREIGN KEY (closed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_envelopes_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_envelopes_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_envelopes_company_reference_key UNIQUE (company_id, reference),
  CONSTRAINT record_envelopes_status_check CHECK (status IN ('open', 'in_review', 'submitted', 'acknowledged', 'awaiting_company_close', 'info_requested', 'closed', 'void')),
  CONSTRAINT record_envelopes_whose_move_check CHECK (whose_move IN ('vessel', 'company', 'none')),
  CONSTRAINT record_envelopes_closed_by_kind_check CHECK (closed_by_kind IS NULL OR closed_by_kind IN ('vessel', 'company_acknowledge', 'company_sign_off', 'company_decision', 'company_close_as')),
  CONSTRAINT record_envelopes_closed_as_check CHECK (closed_as IS NULL OR closed_as IN ('after_review', 'raised_in_error', 'duplicate')),
  CONSTRAINT record_envelopes_company_decision_check CHECK (company_decision IS NULL OR company_decision IN ('approved', 'approved_with_conditions', 'not_approved')),
  CONSTRAINT record_envelopes_cycle_check CHECK (current_cycle >= 1 AND (acknowledged_cycle IS NULL OR acknowledged_cycle BETWEEN 1 AND current_cycle)),
  CONSTRAINT record_envelopes_void_check CHECK (status <> 'void' OR voided_at IS NOT NULL),
  CONSTRAINT record_envelopes_title_check CHECK (title IS NULL OR length(title) <= 200),
  CONSTRAINT record_envelopes_void_reason_check CHECK (void_reason IS NULL OR length(void_reason) <= 2000),
  CONSTRAINT record_envelopes_decision_conditions_check CHECK (decision_conditions IS NULL OR length(decision_conditions) <= 2000),
  CONSTRAINT record_envelopes_section_digests_check CHECK (jsonb_typeof(section_digests) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS record_envelopes_kind_entity_key ON public.record_envelopes (kind_key, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_record_envelopes_scope ON public.record_envelopes (company_id, vessel_id, status);
CREATE INDEX IF NOT EXISTS idx_record_envelopes_whose_move ON public.record_envelopes (company_id, whose_move, follow_up_due);

ALTER TABLE public.record_envelopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.record_envelopes FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_envelopes TO authenticated;
GRANT ALL ON TABLE public.record_envelopes TO service_role;

DROP TRIGGER IF EXISTS trg_record_envelopes_updated_at ON public.record_envelopes;
CREATE TRIGGER trg_record_envelopes_updated_at
  BEFORE UPDATE ON public.record_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- record_events (append-only)

CREATE TABLE IF NOT EXISTS public.record_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  module_key text NOT NULL,
  kind_key text NULL,
  envelope_id uuid NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  reference text NULL,
  action text NOT NULL,
  party text NOT NULL,
  actor_user_id uuid NULL,
  impersonator_user_id uuid NULL,
  from_status text NULL,
  to_status text NULL,
  cycle integer NULL,
  reason text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_type text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_events_pkey PRIMARY KEY (id),
  CONSTRAINT record_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT record_events_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE SET NULL,
  CONSTRAINT record_events_envelope_id_fkey FOREIGN KEY (envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_events_action_check CHECK (action ~ '^[a-z][a-z0-9_.]*$'),
  CONSTRAINT record_events_party_check CHECK (party IN ('vessel', 'company', 'system')),
  CONSTRAINT record_events_reason_check CHECK (reason IS NULL OR length(reason) <= 2000),
  CONSTRAINT record_events_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT record_events_notification_type_check CHECK (notification_type IS NULL OR notification_type ~ '^[a-z][a-z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS idx_record_events_envelope ON public.record_events (envelope_id, created_at);
CREATE INDEX IF NOT EXISTS idx_record_events_company ON public.record_events (company_id, created_at DESC);

ALTER TABLE public.record_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.record_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_events TO authenticated;
GRANT ALL ON TABLE public.record_events TO service_role;

-- ---------------------------------------------------------------- record_snapshots (append-only)

CREATE TABLE IF NOT EXISTS public.record_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL,
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  seq integer NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL,
  sha256 text NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT record_snapshots_envelope_id_fkey FOREIGN KEY (envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT record_snapshots_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE SET NULL,
  CONSTRAINT record_snapshots_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_snapshots_envelope_seq_key UNIQUE (envelope_id, seq),
  CONSTRAINT record_snapshots_seq_check CHECK (seq >= 1),
  CONSTRAINT record_snapshots_reason_check CHECK (reason IN ('submitted', 'decision', 'closed', 'reopened', 'review_started', 'voided')),
  CONSTRAINT record_snapshots_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.record_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.record_snapshots FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_snapshots TO authenticated;
GRANT ALL ON TABLE public.record_snapshots TO service_role;

-- ---------------------------------------------------------------- guard triggers

-- trg_record_envelopes_guard: the status columns change only inside the
-- engine (storm.record_engine on), for every role including the service
-- role; an envelope is never deleted (void instead) outside the engine; an
-- envelope created outside the engine starts open, cycle 1, version 1.
CREATE OR REPLACE FUNCTION public.record_envelopes_guard()
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
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_status_is_server_owned', DETAIL = 'Records are voided, never deleted.';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.current_cycle <> 1 OR NEW.version <> 1 OR NEW.company_acknowledged OR NEW.initial_report_acknowledged
       OR NEW.acknowledged_cycle IS NOT NULL OR NEW.closed_by_kind IS NOT NULL OR NEW.closed_as IS NOT NULL
       OR NEW.company_decision IS NOT NULL OR NEW.voided_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_status_is_server_owned', DETAIL = 'A record starts open; only the record engine moves it.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.closed_by_kind IS DISTINCT FROM OLD.closed_by_kind
     OR NEW.closed_as IS DISTINCT FROM OLD.closed_as
     OR NEW.company_decision IS DISTINCT FROM OLD.company_decision
     OR NEW.company_acknowledged IS DISTINCT FROM OLD.company_acknowledged
     OR NEW.acknowledged_cycle IS DISTINCT FROM OLD.acknowledged_cycle
     OR NEW.initial_report_acknowledged IS DISTINCT FROM OLD.initial_report_acknowledged
     OR NEW.current_cycle IS DISTINCT FROM OLD.current_cycle
     OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
     OR NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_status_is_server_owned', DETAIL = 'Only the record engine (record_transition) changes a record''s status.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_envelopes_guard ON public.record_envelopes;
CREATE TRIGGER trg_record_envelopes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.record_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.record_envelopes_guard();

-- Append-only rows (events, snapshots): never updated or deleted, except
-- by a future purge job (storm.record_purge on) and except that a
-- referential action may set the columns named in the trigger arguments
-- to NULL (a deleted user, vessel or profile).
CREATE OR REPLACE FUNCTION public.record_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_col text;
BEGIN
  IF current_setting('storm.record_purge', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOREACH v_col IN ARRAY TG_ARGV LOOP
      IF v_new -> v_col = 'null'::jsonb THEN
        v_old := v_old - v_col;
        v_new := v_new - v_col;
      END IF;
    END LOOP;
    IF v_old = v_new THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_history_is_append_only', DETAIL = 'Record history is never changed or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_record_events_append_only ON public.record_events;
CREATE TRIGGER trg_record_events_append_only
  BEFORE UPDATE OR DELETE ON public.record_events
  FOR EACH ROW EXECUTE FUNCTION public.record_append_only_guard('vessel_id', 'actor_user_id');

DROP TRIGGER IF EXISTS trg_record_snapshots_append_only ON public.record_snapshots;
CREATE TRIGGER trg_record_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.record_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.record_append_only_guard('vessel_id', 'created_by');

-- ---------------------------------------------------------------- readability (RLS predicate)

-- The read predicate of every record table, for auth.uid(): an active
-- member of the company with fleet reach there, or with reach to the
-- record's vessel. Module capabilities per kind are not evaluated in
-- Phase 2 (D-132). plpgsql (D-229; review round 5): every engine table's
-- SELECT policy calls it per row.
CREATE OR REPLACE FUNCTION public.record_readable(_company_id uuid, _vessel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT auth.uid() IS NOT NULL
       AND _company_id IS NOT NULL
       AND public.user_belongs_to_company(auth.uid(), _company_id)
       AND (public.user_has_fleet_reach(auth.uid(), _company_id)
            OR (_vessel_id IS NOT NULL AND public.user_can_reach_vessel(auth.uid(), _vessel_id)))
  );
END;
$$;

DROP POLICY IF EXISTS record_envelopes_select ON public.record_envelopes;
CREATE POLICY record_envelopes_select ON public.record_envelopes
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

DROP POLICY IF EXISTS record_events_select ON public.record_events;
CREATE POLICY record_events_select ON public.record_events
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

DROP POLICY IF EXISTS record_snapshots_select ON public.record_snapshots;
CREATE POLICY record_snapshots_select ON public.record_snapshots
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

-- ---------------------------------------------------------------- the pure transition engine

-- Exactly transitionEnvelope() of src/lib/records/companyStep.ts: the same
-- check order (version, void, party, from-status, then per action), the
-- same error codes, and the same outcome value with the effects in TS
-- order. Keys are the TS names; an absent key (or JSON null) is the TS
-- default. Parity: supabase/tests/fixtures/record-transitions.json.
CREATE OR REPLACE FUNCTION public.record_transition_decide(p_state jsonb, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s jsonb := coalesce(p_state, '{}'::jsonb);
  i jsonb := coalesce(p_input, '{}'::jsonb);
  v_status text := s ->> 'status';
  v_step text := s ->> 'companyStep';
  v_report_first boolean := public.record_json_truthy(s -> 'reportFirst');
  v_decision_kind boolean := public.record_json_truthy(s -> 'decisionKind');
  v_allow_reopen boolean := public.record_json_truthy(s -> 'allowReopen');
  v_allow_close_as boolean := public.record_json_truthy(s -> 'allowCloseAs');
  v_closed_by text := s ->> 'closedBy';
  v_cycle integer := coalesce((s ->> 'cycle')::integer, 1);
  v_acked integer := (s ->> 'acknowledgedCycle')::integer;
  v_delete_rule text := coalesce(s ->> 'deleteRule', 'draft_only');
  v_action text := i ->> 'action';
  v_actor text := i ->> 'actor';
  v_open_requests numeric := coalesce((i ->> 'openRequests')::numeric, 0);
  v_stale boolean := public.record_json_truthy(i -> 'staleRequiredSignatures');
  v_all boolean := public.record_json_truthy(i -> 'allVesselSlotsSigned');
  v_decision text := CASE WHEN public.record_json_truthy(i -> 'decision') THEN i ->> 'decision' END;
  v_closed_as text := CASE WHEN public.record_json_truthy(i -> 'closedAs') THEN i ->> 'closedAs' END;
  v_reason_blank boolean := CASE WHEN jsonb_typeof(i -> 'reason') = 'string' THEN public.record_text_blank(i ->> 'reason') ELSE NOT public.record_json_truthy(i -> 'reason') END;
  v_conditions_blank boolean := CASE WHEN jsonb_typeof(i -> 'conditions') = 'string' THEN public.record_text_blank(i ->> 'conditions') ELSE NOT public.record_json_truthy(i -> 'conditions') END;
  v_duplicate_blank boolean := CASE WHEN jsonb_typeof(i -> 'duplicateOf') = 'string' THEN public.record_text_blank(i ->> 'duplicateOf') ELSE NOT public.record_json_truthy(i -> 'duplicateOf') END;
  v_from text[];
  -- the outcome
  o_status text;
  o_effects text[] := '{}';
  o_notification text;
  x_closed_by_set boolean := false;
  x_closed_by text;
  x_ack boolean;
  x_acked_set boolean := false;
  x_acked integer;
  x_initial boolean;
  v_new_cycle boolean;
  v_requests_message text;
BEGIN
  IF jsonb_typeof(i -> 'expectedVersion') IN ('number', 'string', 'boolean') AND jsonb_typeof(s -> 'version') IN ('number', 'string', 'boolean')
     AND (i -> 'expectedVersion') <> (s -> 'version') THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'version_conflict', 'message', 'This record changed since you opened it. Reload to see the latest version.'));
  END IF;
  IF v_status = 'void' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'voided', 'message', 'This record has been voided.'));
  END IF;
  IF v_action IN ('acknowledge', 'decide', 'sign_off', 'close_as', 'return_to_vessel', 'reopen', 'remove_company_signature') AND v_actor IS DISTINCT FROM 'company' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'wrong_party', 'message', 'Only the company can do that.'));
  END IF;
  IF v_action IN ('submit', 'vessel_sign') AND v_actor IS DISTINCT FROM 'vessel' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'wrong_party', 'message', 'Only the vessel can do that.'));
  END IF;
  v_from := CASE v_action
    WHEN 'submit' THEN ARRAY['open']
    WHEN 'vessel_sign' THEN ARRAY['open', 'acknowledged', 'in_review', 'info_requested']
    WHEN 'acknowledge' THEN ARRAY['submitted', 'awaiting_company_close']
    WHEN 'decide' THEN ARRAY['awaiting_company_close']
    WHEN 'sign_off' THEN ARRAY['awaiting_company_close']
    WHEN 'close_as' THEN ARRAY['submitted', 'acknowledged', 'awaiting_company_close']
    WHEN 'return_to_vessel' THEN ARRAY['submitted', 'acknowledged', 'awaiting_company_close']
    WHEN 'reopen' THEN ARRAY['closed']
    WHEN 'remove_company_signature' THEN ARRAY['closed']
    WHEN 'void' THEN ARRAY['open', 'in_review', 'submitted', 'acknowledged', 'awaiting_company_close', 'info_requested', 'closed']
  END;
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_action', 'message', 'That is not a record action.'));
  END IF;
  IF v_status IS NULL OR NOT (v_status = ANY (v_from)) THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_transition',
      'message', format('"%s" is not possible while the record is %s.', v_action, replace(coalesce(v_status, 'unknown'), '_', ' '))));
  END IF;

  v_requests_message := CASE WHEN v_open_requests = 1 THEN '1 open request — mark it done or cancel it first'
                             ELSE format('%s open requests — mark them done or cancel them first', v_open_requests) END;

  CASE v_action
    WHEN 'submit' THEN
      IF NOT v_report_first OR v_step = 'none' THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'This kind of record is not submitted to the company on its own.'));
      END IF;
      IF v_stale THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'stale_signatures', 'message', 'Signed before later edits — re-sign to confirm the current content'));
      END IF;
      o_status := 'submitted'; o_effects := ARRAY['snapshot']; o_notification := 'record_submitted_to_company';

    WHEN 'vessel_sign' THEN
      IF NOT v_all THEN
        o_status := 'in_review';
      ELSIF v_stale THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'stale_signatures', 'message', 'Signed before later edits — re-sign to confirm the current content'));
      ELSIF v_step = 'none' THEN
        IF v_open_requests > 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'open_requests', 'message', v_requests_message));
        END IF;
        o_status := 'closed'; o_effects := ARRAY['snapshot']; o_notification := 'record_closed';
        x_closed_by_set := true; x_closed_by := 'vessel';
      ELSE
        o_status := 'awaiting_company_close'; o_effects := ARRAY['snapshot']; o_notification := 'record_submitted_to_company';
      END IF;

    WHEN 'acknowledge' THEN
      IF v_step = 'none' THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'This kind of record has no company step.'));
      END IF;
      IF v_status = 'submitted' THEN
        IF NOT v_report_first THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'Only report-first records are acknowledged on submission.'));
        END IF;
        o_status := 'acknowledged'; o_effects := ARRAY['company_acknowledgement']; o_notification := 'record_acknowledged';
        x_ack := true; x_initial := true;
      ELSIF v_step = 'acknowledge' THEN
        IF v_open_requests > 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'open_requests', 'message', v_requests_message));
        END IF;
        IF v_stale THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'stale_signatures', 'message', 'Signed before later edits — re-sign to confirm the current content'));
        END IF;
        o_status := 'closed'; o_effects := ARRAY['company_acknowledgement', 'company_signature', 'snapshot']; o_notification := 'record_acknowledged';
        x_closed_by_set := true; x_closed_by := 'company_acknowledge'; x_ack := true; x_acked_set := true; x_acked := v_cycle;
      ELSE
        IF v_acked IS NOT NULL AND v_acked = v_cycle THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'already_acknowledged', 'message', 'The company has already acknowledged this review cycle.'));
        END IF;
        o_status := 'awaiting_company_close'; o_effects := ARRAY['company_acknowledgement']; o_notification := 'record_acknowledged';
        x_ack := true; x_acked_set := true; x_acked := v_cycle;
      END IF;

    WHEN 'decide' THEN
      IF v_step IS DISTINCT FROM 'sign_off' OR NOT v_decision_kind THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'This kind of record is not closed by a company decision.'));
      END IF;
      IF v_decision IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'decision_required', 'message', 'Choose approved, approved with conditions or not approved.'));
      END IF;
      IF v_decision = 'not_approved' THEN
        IF v_reason_blank THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'reason_required', 'message', 'Say why it is not approved.'));
        END IF;
        o_status := 'info_requested'; o_effects := ARRAY['snapshot', 'supersede_vessel_signatures', 'new_cycle']; o_notification := 'record_decision';
      ELSE
        IF v_decision = 'approved_with_conditions' AND v_conditions_blank THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conditions_required', 'message', 'List the conditions of the approval.'));
        END IF;
        IF v_open_requests > 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'open_requests', 'message', v_requests_message));
        END IF;
        IF v_stale THEN
          RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'stale_signatures', 'message', 'Signed before later edits — re-sign to confirm the current content'));
        END IF;
        o_status := 'closed'; o_effects := ARRAY['company_signature', 'snapshot']; o_notification := 'record_decision';
        x_closed_by_set := true; x_closed_by := 'company_decision';
      END IF;

    WHEN 'sign_off' THEN
      IF v_step IS DISTINCT FROM 'sign_off' THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'This kind of record does not need company sign-off.'));
      END IF;
      IF v_decision_kind THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'Record the company decision instead of signing off.'));
      END IF;
      IF v_open_requests > 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'open_requests', 'message', v_requests_message));
      END IF;
      IF v_stale THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'stale_signatures', 'message', 'Signed before later edits — re-sign to confirm the current content'));
      END IF;
      o_status := 'closed'; o_effects := ARRAY['company_signature', 'snapshot']; o_notification := 'record_closed';
      x_closed_by_set := true; x_closed_by := 'company_sign_off';

    WHEN 'close_as' THEN
      IF NOT v_allow_close_as THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'This kind of record cannot be closed that way.'));
      END IF;
      IF v_closed_as IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'closed_as_required', 'message', 'Choose how the record is closed.'));
      END IF;
      IF v_closed_as = 'after_review' AND v_status <> 'awaiting_company_close' THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_transition', 'message', 'Closed after review needs the vessel final review signed first.'));
      END IF;
      IF v_closed_as = 'duplicate' AND v_duplicate_blank THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'duplicate_required', 'message', 'Link the record this one duplicates.'));
      END IF;
      IF v_open_requests > 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'open_requests', 'message', v_requests_message));
      END IF;
      IF v_stale THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'stale_signatures', 'message', 'Signed before later edits — re-sign to confirm the current content'));
      END IF;
      o_status := 'closed'; o_effects := ARRAY['snapshot']; o_notification := 'record_closed';
      x_closed_by_set := true; x_closed_by := 'company_close_as';

    WHEN 'return_to_vessel' THEN
      IF v_step = 'none' THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'This kind of record has no company step.'));
      END IF;
      IF v_reason_blank THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'reason_required', 'message', 'Say what the vessel needs to change.'));
      END IF;
      o_status := 'info_requested'; o_effects := ARRAY['snapshot', 'supersede_vessel_signatures', 'new_cycle']; o_notification := 'record_returned';

    WHEN 'reopen' THEN
      IF NOT v_allow_reopen THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'This kind of record cannot be reopened.'));
      END IF;
      IF v_reason_blank THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'reason_required', 'message', 'Say why the record is being reopened.'));
      END IF;
      o_status := CASE WHEN v_report_first THEN 'acknowledged' ELSE 'in_review' END;
      o_effects := ARRAY['snapshot', 'new_cycle']; o_notification := 'record_reopened';
      x_closed_by_set := true; x_closed_by := NULL;

    WHEN 'remove_company_signature' THEN
      IF v_closed_by IS NULL OR v_closed_by NOT IN ('company_acknowledge', 'company_sign_off', 'company_decision') THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'There is no company signature or decision to remove.'));
      END IF;
      IF v_reason_blank THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'reason_required', 'message', 'Say why the company signature is being removed.'));
      END IF;
      o_status := 'awaiting_company_close'; o_effects := ARRAY['remove_company_signature']; o_notification := NULL;
      x_closed_by_set := true; x_closed_by := NULL;

    WHEN 'void' THEN
      IF v_delete_rule IN ('free', 'cascade_parent') THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_for_kind', 'message', 'This kind of record is deleted, not voided.'));
      END IF;
      IF v_delete_rule = 'never_after_submit' AND v_actor IS DISTINCT FROM 'company' THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'wrong_party', 'message', 'Only the company can void this record.'));
      END IF;
      IF v_reason_blank THEN
        RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'reason_required', 'message', 'Say why the record is being voided.'));
      END IF;
      o_status := 'void'; o_effects := ARRAY['snapshot']; o_notification := 'record_voided';
      x_closed_by_set := true; x_closed_by := v_closed_by;
  END CASE;

  v_new_cycle := 'new_cycle' = ANY (o_effects);
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object(
    'status', o_status,
    'closedBy', CASE WHEN x_closed_by_set THEN x_closed_by WHEN o_status = 'closed' THEN v_closed_by END,
    'companyAcknowledged', coalesce(x_ack, CASE WHEN v_new_cycle THEN false ELSE public.record_json_truthy(s -> 'companyAcknowledged') END),
    'cycle', CASE WHEN v_new_cycle THEN v_cycle + 1 ELSE v_cycle END,
    'acknowledgedCycle', CASE WHEN x_acked_set THEN x_acked WHEN v_new_cycle THEN NULL ELSE v_acked END,
    'initialReportAcknowledged', coalesce(x_initial, public.record_json_truthy(s -> 'initialReportAcknowledged')),
    'effects', to_jsonb(o_effects),
    'notification', o_notification
  ));
END;
$$;

-- Exactly vesselSignaturesLocked() (D-51): only the envelope's current
-- cycle, and only when the company acknowledged that cycle (awaiting
-- company close or closed) or closed the record itself.
CREATE OR REPLACE FUNCTION public.record_vessel_signatures_locked(p_state jsonb, p_sheet_cycle integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(
    p_sheet_cycle IS NOT NULL
    AND p_sheet_cycle = coalesce((p_state ->> 'cycle')::integer, 1)
    AND (
      ((p_state ->> 'acknowledgedCycle') IS NOT NULL
       AND (p_state ->> 'acknowledgedCycle')::integer = p_sheet_cycle
       AND (p_state ->> 'status') IN ('awaiting_company_close', 'closed'))
      OR ((p_state ->> 'status') = 'closed'
          AND (p_state ->> 'closedBy') IS NOT NULL
          AND (p_state ->> 'closedBy') IN ('company_acknowledge', 'company_sign_off', 'company_decision', 'company_close_as'))
    ), false)
$$;

-- ---------------------------------------------------------------- engine internals (service role; definers call them)

-- The TS EnvelopeState of an envelope and its kind.
CREATE OR REPLACE FUNCTION public.record_state_of(p_envelope_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', e.status, 'companyStep', k.company_step, 'reportFirst', k.report_first, 'decisionKind', k.decision_kind,
    'allowReopen', k.allow_reopen, 'allowCloseAs', k.allow_close_as, 'closedBy', e.closed_by_kind,
    'companyAcknowledged', e.company_acknowledged, 'cycle', e.current_cycle, 'acknowledgedCycle', e.acknowledged_cycle,
    'initialReportAcknowledged', e.initial_report_acknowledged, 'version', e.version, 'deleteRule', k.delete_rule)
  FROM public.record_envelopes AS e
  JOIN public.record_kinds AS k ON k.key = e.kind_key
  WHERE e.id = p_envelope_id
$$;

-- Open requests in the envelope's status_updates thread (file 12).
CREATE OR REPLACE FUNCTION public.record_open_requests(p_envelope_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT count(*)::integer
    FROM public.record_thread_entries AS te
    JOIN public.record_threads AS t ON t.id = te.thread_id
    WHERE t.envelope_id = p_envelope_id AND t.kind = 'status_updates'
      AND te.entry_type = 'request' AND te.request_state = 'open'
  );
END;
$$;

-- Every required vessel slot of the current cycle has a live signature (file 11).
CREATE OR REPLACE FUNCTION public.record_vessel_slots_complete(p_envelope_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.record_signature_slots AS sl
    JOIN public.record_envelopes AS e ON e.id = sl.envelope_id
    WHERE sl.envelope_id = p_envelope_id AND sl.cycle = e.current_cycle AND sl.party = 'vessel' AND sl.required
      AND NOT EXISTS (SELECT 1 FROM public.record_signatures AS sg
                      WHERE sg.slot_id = sl.id AND sg.removed_at IS NULL AND sg.superseded_at IS NULL)
  );
END;
$$;

-- A live required signature of the current cycle covers content that has
-- changed since (its digest differs from the slot's current digest).
CREATE OR REPLACE FUNCTION public.record_stale_required(p_envelope_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.record_signature_slots AS sl
    JOIN public.record_envelopes AS e ON e.id = sl.envelope_id
    JOIN public.record_signatures AS sg ON sg.slot_id = sl.id AND sg.removed_at IS NULL AND sg.superseded_at IS NULL
    WHERE sl.envelope_id = p_envelope_id AND sl.cycle = e.current_cycle AND sl.required
      AND sg.record_digest IS DISTINCT FROM public.record_digest_of(e.section_digests, sl.covers_sections)
  );
END;
$$;

-- Does the user reach the record: reach to its vessel or fleet reach in
-- its company; for fleet records fleet reach. Reach alone is not write
-- access: the write paths ask record_caller_may_write() (review round 4).
CREATE OR REPLACE FUNCTION public.record_caller_reaches(p_user_id uuid, p_company_id uuid, p_vessel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL
     AND (public.fleet_reach_for(p_user_id, p_company_id)
          OR (p_vessel_id IS NOT NULL AND public.reach_vessel_for(p_user_id, p_vessel_id)))
$$;

-- The user holds an external membership in the company (gap/01 F36, C17,
-- D-123: an external viewer is view-only). Any account_memberships row of
-- kind 'external', whatever its status, window or legacy_managed: an
-- external has no other reach in that company, so counting every such row
-- fails closed. NULL ids -> false (callers AND it with a reach check that
-- is itself false for NULL).
CREATE OR REPLACE FUNCTION public.record_user_is_external(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND p_company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.account_memberships AS m
    WHERE m.user_id = p_user_id AND m.company_id = p_company_id AND m.kind = 'external'
  )
$$;

-- Write access to a record as the vessel party (review round 4,
-- record-engine-external-writes; D-132): the user reaches it
-- (record_caller_reaches) and is no external viewer of its company. Every
-- engine write path asks this (company actors pass through
-- is_company_actor where the company may act); reads stay on
-- record_readable(). NULL or unknown ids -> false (fail closed).
CREATE OR REPLACE FUNCTION public.record_caller_may_write(p_user_id uuid, p_company_id uuid, p_vessel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    p_user_id IS NOT NULL
    AND p_company_id IS NOT NULL
    AND public.record_caller_reaches(p_user_id, p_company_id, p_vessel_id)
    AND NOT public.record_user_is_external(p_user_id, p_company_id),
    false)
$$;

-- The session is a "login as" (impersonation) session: any value of the
-- JWT's app_metadata.impersonating other than false / empty.
CREATE OR REPLACE FUNCTION public.record_impersonating()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(lower(auth.jwt() -> 'app_metadata' ->> 'impersonating'), '') NOT IN ('', 'false', 'null', '0')
$$;

-- Applies an engine outcome (from record_transition_decide) to the
-- envelope: the status columns, who / when stamps, the effects in order
-- (snapshot, company acknowledgement, company signature, removal of the
-- company signature, superseded vessel signatures, the new cycle's slots),
-- whose move, version + 1, and one record_events row. Runs under
-- storm.record_engine; the caller holds the envelope lock. Returns the
-- updated envelope.
CREATE OR REPLACE FUNCTION public.record_engine_apply(p_envelope_id uuid, p_action text, p_party text, p_value jsonb, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS public.record_envelopes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  e public.record_envelopes;
  n public.record_envelopes;
  v_effects text[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_value -> 'effects', '[]'::jsonb)));
  v_status text := p_value ->> 'status';
  v_old_cycle integer;
  v_reason text := nullif(btrim(coalesce(p_payload ->> 'reason', '')), '');
  v_effect text;
  v_snapshot_reason text;
  v_slot_id uuid;
  v_slot_key text;
  v_slot_covers text[];
  v_decision text;
  v_profile public.profiles;
  v_sig_id uuid;
  v_signed_at timestamptz;
  v_digest text;
  v_signer_name text;
  v_payload jsonb;
  v_seq integer;
BEGIN
  SELECT * INTO e FROM public.record_envelopes WHERE id = p_envelope_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found';
  END IF;
  v_old_cycle := e.current_cycle;
  PERFORM set_config('storm.record_engine', 'on', true);

  UPDATE public.record_envelopes AS r SET
    status = v_status,
    closed_by_kind = p_value ->> 'closedBy',
    company_acknowledged = (p_value ->> 'companyAcknowledged')::boolean,
    current_cycle = (p_value ->> 'cycle')::integer,
    acknowledged_cycle = (p_value ->> 'acknowledgedCycle')::integer,
    initial_report_acknowledged = (p_value ->> 'initialReportAcknowledged')::boolean,
    closed_as = CASE
      WHEN p_action = 'close_as' AND v_status = 'closed' THEN p_payload ->> 'closedAs'
      WHEN v_status IN ('closed', 'void') THEN r.closed_as
    END,
    duplicate_of_envelope_id = CASE
      WHEN p_action = 'close_as' AND v_status = 'closed' AND p_payload ->> 'closedAs' = 'duplicate' THEN (p_payload ->> 'duplicateOf')::uuid
      WHEN p_action = 'close_as' THEN NULL
      WHEN v_status IN ('closed', 'void') THEN r.duplicate_of_envelope_id
    END,
    company_decision = CASE
      WHEN p_action = 'decide' THEN p_payload ->> 'decision'
      WHEN p_action IN ('remove_company_signature', 'reopen') THEN NULL
      ELSE r.company_decision
    END,
    decision_conditions = CASE
      WHEN p_action = 'decide' AND p_payload ->> 'decision' = 'approved_with_conditions' THEN nullif(btrim(coalesce(p_payload ->> 'conditions', '')), '')
      WHEN p_action IN ('decide', 'remove_company_signature', 'reopen') THEN NULL
      ELSE r.decision_conditions
    END,
    company_ack_by = CASE WHEN 'company_acknowledgement' = ANY (v_effects) THEN v_uid
                          WHEN NOT (p_value ->> 'companyAcknowledged')::boolean THEN NULL ELSE r.company_ack_by END,
    company_ack_at = CASE WHEN 'company_acknowledgement' = ANY (v_effects) THEN now()
                          WHEN NOT (p_value ->> 'companyAcknowledged')::boolean THEN NULL ELSE r.company_ack_at END,
    submitted_by = CASE WHEN v_status IN ('submitted', 'awaiting_company_close') AND r.submitted_at IS NULL THEN v_uid ELSE r.submitted_by END,
    submitted_at = CASE WHEN v_status IN ('submitted', 'awaiting_company_close') AND r.submitted_at IS NULL THEN now() ELSE r.submitted_at END,
    closed_by_user_id = CASE WHEN v_status = 'closed' THEN v_uid WHEN v_status = 'void' THEN r.closed_by_user_id END,
    closed_at = CASE WHEN v_status = 'closed' THEN now() WHEN v_status = 'void' THEN r.closed_at END,
    voided_at = CASE WHEN v_status = 'void' THEN now() ELSE r.voided_at END,
    voided_by = CASE WHEN v_status = 'void' THEN v_uid ELSE r.voided_by END,
    void_reason = CASE WHEN v_status = 'void' THEN v_reason ELSE r.void_reason END,
    version = r.version + 1
  WHERE r.id = e.id
  RETURNING * INTO n;

  FOREACH v_effect IN ARRAY v_effects LOOP
    IF v_effect = 'snapshot' THEN
      v_snapshot_reason := CASE p_action
        WHEN 'submit' THEN 'submitted'
        WHEN 'vessel_sign' THEN CASE WHEN v_status = 'closed' THEN 'closed' ELSE 'submitted' END
        WHEN 'acknowledge' THEN 'closed'
        WHEN 'decide' THEN 'decision'
        WHEN 'sign_off' THEN 'closed'
        WHEN 'close_as' THEN 'closed'
        WHEN 'return_to_vessel' THEN 'decision'
        WHEN 'reopen' THEN 'reopened'
        WHEN 'void' THEN 'voided'
        ELSE 'review_started'
      END;
      v_payload := jsonb_build_object(
        'envelope', to_jsonb(n),
        'signatures', coalesce((SELECT jsonb_agg(to_jsonb(sg) ORDER BY sg.signed_at, sg.id)
                                FROM public.record_signatures AS sg
                                WHERE sg.envelope_id = e.id AND sg.cycle = v_old_cycle AND sg.removed_at IS NULL AND sg.superseded_at IS NULL), '[]'::jsonb));
      SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM public.record_snapshots WHERE envelope_id = e.id;
      INSERT INTO public.record_snapshots (envelope_id, company_id, vessel_id, seq, reason, payload, sha256, created_by)
      VALUES (e.id, e.company_id, e.vessel_id, v_seq, v_snapshot_reason, v_payload, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), v_uid);

    ELSIF v_effect = 'company_signature' THEN
      v_decision := CASE p_action WHEN 'acknowledge' THEN 'acknowledged' WHEN 'decide' THEN p_payload ->> 'decision' ELSE 'signed_off' END;
      SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid;
      -- The first open company slot of the cycle (no live signature, no
      -- earlier required slot unsigned), else a slot-less decision row.
      v_slot_id := NULL; v_slot_key := NULL; v_slot_covers := NULL;
      SELECT sl.id, sl.slot_key, sl.covers_sections INTO v_slot_id, v_slot_key, v_slot_covers
      FROM public.record_signature_slots AS sl
      WHERE sl.envelope_id = e.id AND sl.cycle = v_old_cycle AND sl.party = 'company'
        AND NOT EXISTS (SELECT 1 FROM public.record_signatures AS sg WHERE sg.slot_id = sl.id AND sg.removed_at IS NULL AND sg.superseded_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM public.record_signature_slots AS o
                        WHERE o.envelope_id = sl.envelope_id AND o.cycle = sl.cycle AND o.order_no < sl.order_no AND o.required
                          AND NOT EXISTS (SELECT 1 FROM public.record_signatures AS sg2 WHERE sg2.slot_id = o.id AND sg2.removed_at IS NULL AND sg2.superseded_at IS NULL))
      ORDER BY sl.order_no, sl.slot_key
      LIMIT 1;
      v_sig_id := gen_random_uuid();
      v_signed_at := clock_timestamp();
      v_digest := public.record_digest_of(n.section_digests, CASE WHEN v_slot_id IS NULL THEN NULL ELSE v_slot_covers END);
      -- The stored name is also what the integrity hash binds to the
      -- profile id (D-209; review round 3, signer-name-self-editable).
      v_signer_name := left(coalesce(nullif(btrim(coalesce(v_profile.first_name, '') || ' ' || coalesce(v_profile.last_name, '')), ''), 'Company'), 120);
      INSERT INTO public.record_signatures (
        id, envelope_id, slot_id, company_id, vessel_id, cycle, slot_key, party, signer_user_id, signer_profile_id, signer_name,
        signer_kind, method, decision, record_digest, record_version, integrity_hash, signed_at
      ) VALUES (
        v_sig_id, e.id, v_slot_id, e.company_id, e.vessel_id, v_old_cycle, v_slot_key, 'company', v_uid, v_profile.id,
        v_signer_name,
        'shore', 'verified', v_decision, v_digest, n.version,
        public.record_signature_hash(v_digest, v_slot_id, v_profile.id, v_signer_name, v_signed_at, NULL), v_signed_at
      );
      IF v_slot_id IS NOT NULL THEN
        UPDATE public.record_signature_slots SET passed_to_profile_id = NULL, passed_at = NULL, passed_by = NULL WHERE id = v_slot_id;
      END IF;

    ELSIF v_effect = 'remove_company_signature' THEN
      UPDATE public.record_signatures AS sg
      SET removed_at = now(), removed_by = v_uid, removal_reason = left(v_reason, 500)
      WHERE sg.id = (
        SELECT x.id FROM public.record_signatures AS x
        WHERE x.envelope_id = e.id AND x.party = 'company' AND x.decision IS NOT NULL AND x.removed_at IS NULL AND x.superseded_at IS NULL
        ORDER BY x.signed_at DESC, x.id DESC
        LIMIT 1);

    ELSIF v_effect = 'supersede_vessel_signatures' THEN
      UPDATE public.record_signatures
      SET superseded_at = now()
      WHERE envelope_id = e.id AND cycle = v_old_cycle AND party = 'vessel' AND removed_at IS NULL AND superseded_at IS NULL;

    ELSIF v_effect = 'new_cycle' THEN
      PERFORM public.record_instantiate_slots(e.id, n.current_cycle);
    END IF;
  END LOOP;

  UPDATE public.record_envelopes SET whose_move = public.record_whose_move(e.id) WHERE id = e.id RETURNING * INTO n;

  INSERT INTO public.record_events (
    company_id, vessel_id, module_key, kind_key, envelope_id, entity_id, reference, action, party, actor_user_id,
    from_status, to_status, cycle, reason, payload, notification_type
  ) VALUES (
    e.company_id, e.vessel_id, e.module_key, e.kind_key, e.id, e.entity_id, e.reference, p_action, p_party, v_uid,
    e.status, n.status, v_old_cycle, left(v_reason, 2000),
    jsonb_strip_nulls(jsonb_build_object('effects', to_jsonb(v_effects), 'decision', p_payload ->> 'decision', 'closed_as', p_payload ->> 'closedAs',
      'new_cycle', CASE WHEN n.current_cycle <> v_old_cycle THEN n.current_cycle END)),
    p_value ->> 'notification'
  );

  PERFORM set_config('storm.record_engine', v_prev_flag, true);
  RETURN n;
END;
$$;

-- whoseMove() (whoseMove.ts) over the envelope status and its
-- status_updates thread (file 12): closed / void none; an open request
-- without a reply vessel; open requests all replied company; submitted /
-- awaiting_company_close company; open / in_review / info_requested
-- vessel; else (acknowledged) the side that did not post last (vessel when
-- nobody has).
CREATE OR REPLACE FUNCTION public.record_whose_move(p_envelope_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_thread uuid;
  v_unreplied boolean;
  v_open boolean;
  v_last_party text;
BEGIN
  SELECT status INTO v_status FROM public.record_envelopes WHERE id = p_envelope_id;
  IF v_status IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_status IN ('closed', 'void') THEN
    RETURN 'none';
  END IF;
  SELECT id INTO v_thread FROM public.record_threads WHERE envelope_id = p_envelope_id AND kind = 'status_updates';
  SELECT bool_or(NOT EXISTS (SELECT 1 FROM public.record_thread_entries AS r WHERE r.thread_id = v_thread AND r.entry_type = 'reply' AND r.parent_id = q.id)),
         count(*) > 0
    INTO v_unreplied, v_open
  FROM public.record_thread_entries AS q
  WHERE q.thread_id = v_thread AND q.entry_type = 'request' AND q.request_state = 'open';
  IF coalesce(v_unreplied, false) THEN
    RETURN 'vessel';
  END IF;
  IF coalesce(v_open, false) THEN
    RETURN 'company';
  END IF;
  IF v_status IN ('submitted', 'awaiting_company_close') THEN
    RETURN 'company';
  END IF;
  IF v_status IN ('open', 'in_review', 'info_requested') THEN
    RETURN 'vessel';
  END IF;
  SELECT party INTO v_last_party
  FROM public.record_thread_entries
  WHERE thread_id = v_thread AND entry_type <> 'system'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF v_last_party IS NULL OR v_last_party = 'system' THEN
    RETURN 'vessel';
  END IF;
  RETURN CASE WHEN v_last_party = 'vessel' THEN 'company' ELSE 'vessel' END;
END;
$$;

-- ---------------------------------------------------------------- the record API

-- Opens an envelope for a kind (and an entity): vessel kinds need a vessel
-- the caller may write (record_caller_may_write: reach, fleet reach also
-- passes, and no external membership), fleet kinds no vessel and write
-- access to the fleet (fleet reach, not external) or company-actor
-- rights; the caller is active. The
-- reference comes from format_reference(); cycle-1 slots from the kind's
-- template (file 11); event 'created'. Idempotent on (kind, entity): a
-- second call returns the existing envelope (if the caller may read it).
-- Errors: 42501 (no access), 22023 (record_kind_unknown,
-- record_kind_not_enveloped, vessel_required, fleet_record_has_no_vessel,
-- title_too_long, company_required).
CREATE OR REPLACE FUNCTION public.record_open_envelope(p_kind_key text, p_vessel_id uuid DEFAULT NULL, p_entity_id uuid DEFAULT NULL, p_title text DEFAULT NULL)
RETURNS public.record_envelopes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  k public.record_kinds;
  e public.record_envelopes;
  v_company uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_party text;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO k FROM public.record_kinds WHERE key = p_kind_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'record_kind_unknown';
  END IF;
  IF NOT k.enveloped THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'record_kind_not_enveloped';
  END IF;
  IF v_title IS NOT NULL AND length(v_title) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'title_too_long';
  END IF;

  IF k.scope = 'vessel' THEN
    IF p_vessel_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_required';
    END IF;
    SELECT company_id INTO v_company FROM public.vessels WHERE id = p_vessel_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
    END IF;
    IF v_uid IS NOT NULL AND NOT (
      public.user_belongs_to_company(v_uid, v_company)
      AND public.record_caller_may_write(v_uid, v_company, p_vessel_id)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
    END IF;
  ELSE
    IF p_vessel_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'fleet_record_has_no_vessel';
    END IF;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'company_required', DETAIL = 'A fleet record is opened by a signed-in member of the company.';
    END IF;
    SELECT company_id INTO v_company FROM public.profiles WHERE user_id = v_uid;
    IF v_company IS NULL OR NOT (public.record_caller_may_write(v_uid, v_company, NULL) OR public.is_company_actor(v_uid, NULL)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
    END IF;
  END IF;

  -- An entity id binds the envelope to a domain row: from a signed-in
  -- session only a domain definer that has verified that row (company,
  -- vessel, module) may pass one, and it says so with the transaction-local
  -- flag storm.record_domain (D-159 style refusal otherwise). The browser
  -- opens entity-less envelopes; the service role is trusted.
  IF p_entity_id IS NOT NULL AND v_uid IS NOT NULL AND coalesce(current_setting('storm.record_domain', true), '') <> 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entity_unverified',
      DETAIL = 'An entity-bound envelope is opened by the domain function that owns the entity.';
  END IF;

  -- Idempotent on (kind, entity), serialised per pair; never an envelope of
  -- another company (42501) or of another vessel than the one asked for
  -- (22023 envelope_scope_mismatch).
  IF p_entity_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('record_envelope:' || k.key || ':' || p_entity_id::text, 0));
    SELECT * INTO e FROM public.record_envelopes WHERE kind_key = k.key AND entity_id = p_entity_id;
    IF FOUND THEN
      IF e.company_id <> v_company OR (v_uid IS NOT NULL AND NOT public.record_readable(e.company_id, e.vessel_id)) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
      END IF;
      IF e.vessel_id IS DISTINCT FROM p_vessel_id THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'envelope_scope_mismatch',
          DETAIL = 'That entity already has an envelope on another vessel.';
      END IF;
      RETURN e;
    END IF;
  END IF;

  PERFORM set_config('storm.record_engine', 'on', true);
  INSERT INTO public.record_envelopes (company_id, vessel_id, module_key, kind_key, entity_id, reference, title, status, whose_move, current_cycle, version, opened_by)
  VALUES (v_company, p_vessel_id, k.module_key, k.key, p_entity_id,
          public.format_reference(k.ref_prefix, v_company, p_vessel_id, current_date),
          v_title, 'open', 'vessel', 1, 1, v_uid)
  RETURNING * INTO e;

  PERFORM public.record_instantiate_slots(e.id, 1);

  v_party := CASE WHEN v_uid IS NULL THEN 'system' WHEN public.is_company_actor(v_uid, p_vessel_id) THEN 'company' ELSE 'vessel' END;
  INSERT INTO public.record_events (company_id, vessel_id, module_key, kind_key, envelope_id, entity_id, reference, action, party, actor_user_id, to_status, cycle, payload)
  VALUES (e.company_id, e.vessel_id, e.module_key, e.kind_key, e.id, e.entity_id, e.reference, 'created', v_party, v_uid, 'open', 1, '{}'::jsonb);

  PERFORM set_config('storm.record_engine', v_prev_flag, true);
  RETURN e;
END;
$$;

-- The only way a record's status changes (with record_sign_slot's internal
-- vessel_sign). Party, open requests, stale signatures and "all vessel
-- slots signed" are derived here; the payload carries only reason,
-- decision, conditions, closedAs and duplicateOf. Returns
-- {ok:true, value:{envelope, effects, notification}} or the decide
-- function's {ok:false, error}; impersonating sessions, vessel_sign,
-- unknown actions / payload keys, a reason or conditions over 2000
-- characters (invalid_input; never truncated) and a caller who can read
-- the record but neither acts for the company nor may write it
-- (no_write_access: an external viewer, review round 4) are refused as
-- results. Raises 42501 when the caller is inactive or cannot read the
-- record, P0002 for an unknown id.
CREATE OR REPLACE FUNCTION public.record_transition(p_envelope_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_expected_version integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e public.record_envelopes;
  n public.record_envelopes;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_party text;
  v_company_actor boolean;
  v_reaches boolean;
  v_input jsonb;
  v_result jsonb;
  v_dup uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = p_envelope_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found';
  END IF;
  IF NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF public.record_impersonating() THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'impersonating', 'message', 'Records cannot be changed while acting as another user.'));
  END IF;
  IF p_action IS NULL OR p_action = 'vessel_sign' OR p_action NOT IN ('submit', 'acknowledge', 'decide', 'sign_off', 'close_as', 'return_to_vessel', 'reopen', 'remove_company_signature', 'void') THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_action', 'message', 'That action is not available here.'));
  END IF;
  IF jsonb_typeof(v_payload) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_payload) AS key WHERE key NOT IN ('reason', 'decision', 'conditions', 'closedAs', 'duplicateOf')) THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'message', 'Only a reason, decision, conditions, close-as option or duplicate record can be sent.'));
  END IF;
  -- Bounded free text (review round 4, record-free-text-unbounded): refused,
  -- never truncated (a stored reason is what the user wrote).
  IF coalesce(length(v_payload ->> 'reason'), 0) > 2000 OR coalesce(length(v_payload ->> 'conditions'), 0) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'message', 'Keep the reason and conditions to 2000 characters.'));
  END IF;

  v_company_actor := public.is_company_actor(v_uid, e.vessel_id);
  -- The vessel party submits: write access to the record (no external
  -- membership), and for a vessel record reach to that vessel itself (fleet
  -- reach alone does not make a company user the vessel).
  v_reaches := public.record_caller_may_write(v_uid, e.company_id, e.vessel_id)
    AND (e.vessel_id IS NULL OR public.reach_vessel_for(v_uid, e.vessel_id));
  v_party := CASE
    WHEN p_action = 'submit' THEN CASE WHEN v_reaches THEN 'vessel' ELSE 'company' END
    ELSE CASE WHEN v_company_actor THEN 'company' ELSE 'vessel' END
  END;
  -- Readable is not writable (review round 4, record-engine-external-writes):
  -- an external viewer reads the record and changes nothing.
  IF NOT v_company_actor AND NOT public.record_caller_may_write(v_uid, e.company_id, e.vessel_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'no_write_access', 'message', 'You can view this record but not change it.'));
  END IF;

  v_input := jsonb_strip_nulls(jsonb_build_object(
    'action', p_action,
    'actor', v_party,
    'openRequests', public.record_open_requests(e.id),
    'staleRequiredSignatures', public.record_stale_required(e.id),
    'allVesselSlotsSigned', public.record_vessel_slots_complete(e.id),
    'expectedVersion', p_expected_version
  )) || (v_payload - 'expectedVersion');
  v_result := public.record_transition_decide(public.record_state_of(e.id), v_input);
  IF NOT (v_result ->> 'ok')::boolean THEN
    RETURN v_result;
  END IF;

  -- A duplicate must be another readable record of the same company.
  IF p_action = 'close_as' AND v_payload ->> 'closedAs' = 'duplicate' THEN
    BEGIN
      v_dup := (v_payload ->> 'duplicateOf')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_dup := NULL;
    END;
    IF v_dup IS NULL OR v_dup = e.id OR NOT EXISTS (
      SELECT 1 FROM public.record_envelopes AS d WHERE d.id = v_dup AND d.company_id = e.company_id AND public.record_readable(d.company_id, d.vessel_id)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_duplicate', 'message', 'Link a record of this company that you can see.'));
    END IF;
  END IF;

  n := public.record_engine_apply(e.id, p_action, v_party, v_result -> 'value', v_payload);
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object(
    'envelope', to_jsonb(n),
    'effects', v_result -> 'value' -> 'effects',
    'notification', v_result -> 'value' -> 'notification'));
END;
$$;

-- Merges {section_key: sha256-hex} ('*' = the whole record) into the
-- envelope's section digests and recomputes content_digest. Domain
-- definers call it (Phase 3); never the browser (a client-set digest would
-- hide stale signatures). With a JWT the caller must read the record.
CREATE OR REPLACE FUNCTION public.record_set_section_digests(p_envelope_id uuid, p_digests jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.record_envelopes;
  v_merged jsonb;
BEGIN
  IF p_digests IS NULL OR jsonb_typeof(p_digests) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_each(p_digests) AS d
    WHERE (d.key <> '*' AND d.key !~ '^[a-z][a-z0-9_]*$') OR jsonb_typeof(d.value) <> 'string' OR (d.value #>> '{}') !~ '^[0-9a-f]{64}$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_digests_invalid', DETAIL = 'Section keys are snake_case (or *), digests sha256 hex.';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = p_envelope_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  v_merged := e.section_digests || p_digests;
  UPDATE public.record_envelopes
  SET section_digests = v_merged,
      content_digest = (SELECT encode(sha256(convert_to(string_agg(key || ':' || (v_merged ->> key), E'\n' ORDER BY key COLLATE "C"), 'UTF8')), 'hex')
                        FROM jsonb_object_keys(v_merged) AS key)
  WHERE id = e.id;
END;
$$;

-- The current digest of the sections a slot covers (record_digest_of over
-- the envelope's section digests).
CREATE OR REPLACE FUNCTION public.record_slot_digest(p_envelope_id uuid, p_covers text[])
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.record_digest_of(e.section_digests, p_covers) FROM public.record_envelopes AS e WHERE e.id = p_envelope_id
$$;

-- One record_events row for an envelope (actor = auth.uid()), for the
-- engine functions and Phase 3 domain definers. Returns the event id.
CREATE OR REPLACE FUNCTION public.record_log_event(p_envelope_id uuid, p_action text, p_party text, p_payload jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT NULL, p_notification_type text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.record_envelopes;
  v_id uuid;
BEGIN
  SELECT * INTO e FROM public.record_envelopes WHERE id = p_envelope_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found';
  END IF;
  INSERT INTO public.record_events (company_id, vessel_id, module_key, kind_key, envelope_id, entity_id, reference, action, party, actor_user_id, cycle, reason, payload, notification_type)
  VALUES (e.company_id, e.vessel_id, e.module_key, e.kind_key, e.id, e.entity_id, e.reference, p_action, p_party, auth.uid(), e.current_cycle,
          left(nullif(btrim(coalesce(p_reason, '')), ''), 2000), coalesce(p_payload, '{}'::jsonb), p_notification_type)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.record_text_blank(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_json_truthy(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_slot_template_valid(jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_digest_of(jsonb, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_envelopes_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_append_only_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_readable(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_transition_decide(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_vessel_signatures_locked(jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_state_of(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_open_requests(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_vessel_slots_complete(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_stale_required(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_caller_reaches(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_user_is_external(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_caller_may_write(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_impersonating() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_engine_apply(uuid, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_whose_move(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_open_envelope(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_transition(uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_set_section_digests(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_slot_digest(uuid, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_log_event(uuid, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_text_blank(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_json_truthy(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_slot_template_valid(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_digest_of(jsonb, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_readable(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_transition_decide(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_vessel_signatures_locked(jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_state_of(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_open_requests(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_vessel_slots_complete(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_stale_required(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_caller_reaches(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_user_is_external(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_caller_may_write(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_impersonating() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_engine_apply(uuid, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_whose_move(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_open_envelope(text, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_transition(uuid, text, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_set_section_digests(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_slot_digest(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_log_event(uuid, text, text, jsonb, text, text) TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.record_kinds IS 'Record-kind catalogue (gap/08 REG1; G7): one row per workflow record kind, mirroring src/lib/records/registry.ts definitions (snake_case slot template). Every kind names its capability_path (domain.module.subcategory; record_kinds_capability_path_check, review round 4): the engine evaluates it before the first kind registers (D-132; BUILD-PLAN open item), never a hard-coded list of legacy role names. Platform catalogue: no company_id (rule 3 exception). Read: active users; writes: service role (domain migrations from Phase 3; none seeded in Phase 2).';
COMMENT ON TABLE public.record_envelopes IS 'The record envelope (gap/08 §A; D-132): status, whose move, the company step, cycles, acknowledgements, digests and version of one workflow record. Free text is bounded (title 200, void_reason and decision_conditions 2000). Read: company members with fleet reach or reach to the vessel (record_readable); writes need record_caller_may_write or a company actor. No client writes: record_open_envelope / record_transition / record_sign_slot only; trg_record_envelopes_guard refuses status changes outside the engine, for every role.';
COMMENT ON TABLE public.record_events IS 'Append-only audit trail of record actions (gap/08 AU1-AU2): who (actor, party), what (action, from -> to status, cycle, reason), ids and codes in the payload (no names or emails), the notification type. No updated_at (rule 3 exception). Never updated or deleted (trg_record_events_append_only).';
COMMENT ON TABLE public.record_snapshots IS 'Append-only snapshots (gap/08 SN1): the envelope and the live signatures of the cycle at submit / decision / close / reopen / void, with a sha256. No updated_at (rule 3 exception).';
COMMENT ON FUNCTION public.record_text_blank(text) IS 'JS blankness: NULL or only JS whitespace (record engine parity).';
COMMENT ON FUNCTION public.record_json_truthy(jsonb) IS 'JS truthiness of a JSON value (record engine parity).';
COMMENT ON FUNCTION public.record_slot_template_valid(jsonb, text) IS 'validateSlotTemplate() on a snake_case slot template (a company slot is never witnessed, visitor or on-behalf), plus "company slots need a company step". Immutable (backs record_kinds_slot_template_check).';
COMMENT ON FUNCTION public.record_digest_of(jsonb, text[]) IS 'sha256 hex of the sorted key:digest lines of the covered sections (* when none named); empty when none known. Pure.';
COMMENT ON FUNCTION public.record_envelopes_guard() IS 'Trigger: status columns and deletes only under storm.record_engine (every role); a record created outside the engine starts open.';
COMMENT ON FUNCTION public.record_append_only_guard() IS 'Trigger: append-only history (UPDATE / DELETE refused) except storm.record_purge and referential set-null of the named columns.';
COMMENT ON FUNCTION public.record_readable(uuid, uuid) IS 'The read predicate of the record tables for auth.uid(): active company member with fleet reach, or reach to the vessel. plpgsql (D-229).';
COMMENT ON FUNCTION public.record_transition_decide(jsonb, jsonb) IS 'Pure SQL mirror of transitionEnvelope() (companyStep.ts): same check order, error codes and outcome value. Parity: record-transitions.json.';
COMMENT ON FUNCTION public.record_vessel_signatures_locked(jsonb, integer) IS 'Pure SQL mirror of vesselSignaturesLocked() (D-51). Parity: record-vessel-lock.json.';
COMMENT ON FUNCTION public.record_state_of(uuid) IS 'Internal: the TS EnvelopeState of an envelope and its kind.';
COMMENT ON FUNCTION public.record_open_requests(uuid) IS 'Internal: open requests in the envelope''s status_updates thread.';
COMMENT ON FUNCTION public.record_vessel_slots_complete(uuid) IS 'Internal: every required vessel slot of the current cycle has a live signature.';
COMMENT ON FUNCTION public.record_stale_required(uuid) IS 'Internal: a live required signature of the current cycle is stale.';
COMMENT ON FUNCTION public.record_caller_reaches(uuid, uuid, uuid) IS 'Internal: the user has fleet reach in the company or reach to the vessel. Reach only: write access is record_caller_may_write().';
COMMENT ON FUNCTION public.record_user_is_external(uuid, uuid) IS 'Internal (service role): the user has an account_memberships row of kind external in the company, whatever its status, window or legacy_managed (gap/01 F36, D-123: external viewers are view-only; fails closed). NULL ids -> false.';
COMMENT ON FUNCTION public.record_caller_may_write(uuid, uuid, uuid) IS 'Internal (service role): write access to a record as the vessel party (review round 4; D-132): record_caller_reaches() and not record_user_is_external(). Every record-engine write path asks it; reads stay on record_readable(). NULL or unknown ids -> false.';
COMMENT ON FUNCTION public.record_impersonating() IS 'Internal: the JWT marks a login-as session (app_metadata.impersonating).';
COMMENT ON FUNCTION public.record_engine_apply(uuid, text, text, jsonb, jsonb) IS 'Internal: applies an engine outcome (status, stamps, effects, whose move, version, one event) under storm.record_engine. A company signature''s integrity hash covers the stored signer name with the profile id (D-209).';
COMMENT ON FUNCTION public.record_whose_move(uuid) IS 'whoseMove() over the envelope status and its status_updates thread. Internal (service role).';
COMMENT ON FUNCTION public.record_open_envelope(text, uuid, uuid, text) IS 'Opens a record envelope for a kind (vessel or fleet), with its reference and cycle-1 slots; the caller may write the vessel (record_caller_may_write) or, for a fleet kind, the fleet, or is a company actor (42501 record_access_denied otherwise: an external viewer opens nothing); idempotent on (kind, entity) within the same company and vessel (42501 record_access_denied / 22023 envelope_scope_mismatch otherwise). From a signed-in session an entity id needs the transaction-local storm.record_domain flag a domain definer sets after verifying the entity (22023 entity_unverified).';
COMMENT ON FUNCTION public.record_transition(uuid, text, jsonb, integer) IS 'The only status change path for a record (D-132): server-derived party and guards, record_transition_decide, effects applied, one event. A reader who neither acts for the company nor may write the record (record_caller_may_write) gets no_write_access; a reason or conditions over 2000 characters invalid_input. Returns a result envelope.';
COMMENT ON FUNCTION public.record_set_section_digests(uuid, jsonb) IS 'Merges section digests (sha256 hex) into an envelope and recomputes content_digest. Service role / domain definers only.';
COMMENT ON FUNCTION public.record_slot_digest(uuid, text[]) IS 'The current digest of the covered sections of an envelope. Service role only.';
COMMENT ON FUNCTION public.record_log_event(uuid, text, text, jsonb, text, text) IS 'Writes one record_events row for an envelope (actor = auth.uid()). Service role / definers.';
