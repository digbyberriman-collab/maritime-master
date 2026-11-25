-- =================================================================
-- PLATFORM P4: record engine, unit 3/3: status-update and company-review
-- threads (gap/08 §D, TH1-TH3; Phase 2 spec §A.12; proposed D-134)
-- Tables: record_threads (status_updates, company_review),
--   record_thread_entries (append-only except the request fields)
-- Helpers: record_js_trim(), record_follow_up_due(),
--   record_thread_entries_guard(), record_thread_entries_envelope(),
--   record_post_thread_entry(), record_resolve_thread_request()
-- TS mirror: src/lib/records/services/db.pending.ts (record_threads,
--   record_thread_entries, record_post_thread_entry,
--   record_resolve_thread_request); the pure engines
--   src/lib/records/threads.ts and whoseMove.ts (frozen in Phase 2)
-- Parity: supabase/tests/fixtures/record-thread-scenarios.json, asserted by
--   supabase/tests/sql/p4_threads
-- =================================================================
--
-- Unit 3 of the record engine (files 20261123020000, 020100, 020200: apply
-- together, in order, in one sitting; CC-18).
--
-- The status_updates thread is TH1: updates (either side, optional
-- follow-up date), requests (the company, with a due date), replies (the
-- vessel, to an open request) and engine entries. It drives the
-- envelope's whose_move, last_update_at and follow_up_due, recomputed by
-- trigger. Entries are append-only: an edit posts a replacement (only the
-- author, only the newest version, never a request or an engine entry);
-- only a request's state, due date and resolution change, inside the
-- engine. Sign-off and close are refused while a request is open
-- (record_transition counts them). The rules and codes mirror threads.ts.
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.record_envelopes') IS NULL OR to_regprocedure('public.record_whose_move(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020200_platform_record_threads needs the record registry: apply 20261123020000_platform_record_registry.sql first (the record engine is one unit)';
  END IF;
  IF to_regprocedure('public.record_refusal(text,text)') IS NULL OR to_regclass('public.record_signatures') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020200_platform_record_threads needs the signature slots: apply 20261123020100_platform_record_signatures.sql first (the record engine is one unit)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.record_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL,
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_threads_pkey PRIMARY KEY (id),
  CONSTRAINT record_threads_envelope_id_fkey FOREIGN KEY (envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_threads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT record_threads_envelope_kind_key UNIQUE (envelope_id, kind),
  CONSTRAINT record_threads_kind_check CHECK (kind IN ('status_updates', 'company_review'))
);

CREATE TABLE IF NOT EXISTS public.record_thread_entries (
  id uuid NOT NULL,
  thread_id uuid NOT NULL,
  envelope_id uuid NOT NULL,
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  entry_type text NOT NULL,
  party text NOT NULL,
  author_user_id uuid NULL,
  author_profile_id uuid NULL,
  body text NOT NULL,
  follow_up_due date NULL,
  request_due date NULL,
  request_state text NULL,
  request_resolved_by uuid NULL,
  request_resolved_at timestamptz NULL,
  resolution_note text NULL,
  due_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_id uuid NULL,
  replaces_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_thread_entries_pkey PRIMARY KEY (id),
  CONSTRAINT record_thread_entries_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.record_threads(id) ON DELETE RESTRICT,
  CONSTRAINT record_thread_entries_envelope_id_fkey FOREIGN KEY (envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_thread_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT record_thread_entries_author_profile_id_fkey FOREIGN KEY (author_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT record_thread_entries_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.record_thread_entries(id),
  CONSTRAINT record_thread_entries_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES public.record_thread_entries(id),
  CONSTRAINT record_thread_entries_entry_type_check CHECK (entry_type IN ('update', 'request', 'reply', 'system')),
  CONSTRAINT record_thread_entries_party_check CHECK (party IN ('vessel', 'company', 'system')),
  CONSTRAINT record_thread_entries_body_check CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  CONSTRAINT record_thread_entries_request_state_check CHECK (request_state IS NULL OR request_state IN ('open', 'done', 'cancelled')),
  CONSTRAINT record_thread_entries_resolution_note_check CHECK (resolution_note IS NULL OR length(resolution_note) <= 2000),
  CONSTRAINT record_thread_entries_due_history_check CHECK (jsonb_typeof(due_history) = 'array'),
  CONSTRAINT record_thread_entries_request_check CHECK ((entry_type = 'request') = (request_state IS NOT NULL AND request_due IS NOT NULL)),
  CONSTRAINT record_thread_entries_reply_check CHECK (entry_type <> 'reply' OR parent_id IS NOT NULL),
  CONSTRAINT record_thread_entries_author_check CHECK (entry_type = 'system' OR author_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_record_thread_entries_envelope ON public.record_thread_entries (envelope_id, created_at);
CREATE INDEX IF NOT EXISTS idx_record_thread_entries_thread ON public.record_thread_entries (thread_id, created_at);

ALTER TABLE public.record_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_thread_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.record_threads FROM anon, authenticated;
REVOKE ALL ON TABLE public.record_thread_entries FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_threads TO authenticated;
GRANT SELECT ON TABLE public.record_thread_entries TO authenticated;
GRANT ALL ON TABLE public.record_threads TO service_role;
GRANT ALL ON TABLE public.record_thread_entries TO service_role;

DROP TRIGGER IF EXISTS trg_record_threads_updated_at ON public.record_threads;
CREATE TRIGGER trg_record_threads_updated_at
  BEFORE UPDATE ON public.record_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_record_thread_entries_updated_at ON public.record_thread_entries;
CREATE TRIGGER trg_record_thread_entries_updated_at
  BEFORE UPDATE ON public.record_thread_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS record_threads_select ON public.record_threads;
CREATE POLICY record_threads_select ON public.record_threads
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

DROP POLICY IF EXISTS record_thread_entries_select ON public.record_thread_entries;
CREATE POLICY record_thread_entries_select ON public.record_thread_entries
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

-- ---------------------------------------------------------------- helpers and triggers

-- JS String.prototype.trim() (the JS whitespace and line-terminator set).
CREATE OR REPLACE FUNCTION public.record_js_trim(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT regexp_replace(p_text,
    '^[\u0009-\u000d    -     　﻿]+|[\u0009-\u000d    -     　﻿]+$', '', 'g')
$$;

-- followUpDue() (threads.ts) of the envelope's status_updates thread,
-- today = current_date: the earliest due date of the open requests, else
-- the follow-up date of the newest unedited update that set one, while it
-- has not passed.
CREATE OR REPLACE FUNCTION public.record_follow_up_due(p_envelope_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread uuid;
  v_due date;
BEGIN
  SELECT id INTO v_thread FROM public.record_threads WHERE envelope_id = p_envelope_id AND kind = 'status_updates';
  IF v_thread IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT min(request_due) INTO v_due FROM public.record_thread_entries
  WHERE thread_id = v_thread AND entry_type = 'request' AND request_state = 'open';
  IF v_due IS NOT NULL THEN
    RETURN v_due;
  END IF;
  SELECT u.follow_up_due INTO v_due
  FROM public.record_thread_entries AS u
  WHERE u.thread_id = v_thread AND u.entry_type = 'update' AND u.follow_up_due IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.record_thread_entries AS r WHERE r.replaces_id = u.id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT 1;
  RETURN CASE WHEN v_due >= current_date THEN v_due END;
END;
$$;

-- trg_record_thread_entries_guard: entries are never deleted; an UPDATE
-- may change only a request's state, due date, resolution and due history
-- (and updated_at), inside the engine; a deleted profile may set
-- author_profile_id to NULL.
CREATE OR REPLACE FUNCTION public.record_thread_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mutable text[] := ARRAY['request_state', 'request_due', 'request_resolved_by', 'request_resolved_at', 'resolution_note', 'due_history', 'updated_at'];
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_history_is_append_only', DETAIL = 'Thread entries are never deleted.';
  END IF;
  v_old := to_jsonb(OLD) - v_mutable;
  v_new := to_jsonb(NEW) - v_mutable;
  IF NEW.author_profile_id IS NULL AND OLD.author_profile_id IS NOT NULL THEN
    v_old := v_old - 'author_profile_id';
    v_new := v_new - 'author_profile_id';
  END IF;
  IF v_old IS DISTINCT FROM v_new THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_history_is_append_only', DETAIL = 'A thread entry is never edited; post a replacement.';
  END IF;
  IF (to_jsonb(NEW) - 'updated_at' - 'author_profile_id') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'author_profile_id')
     AND current_setting('storm.record_engine', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_status_is_server_owned', DETAIL = 'Only the record engine resolves a request.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_thread_entries_guard ON public.record_thread_entries;
CREATE TRIGGER trg_record_thread_entries_guard
  BEFORE UPDATE OR DELETE ON public.record_thread_entries
  FOR EACH ROW EXECUTE FUNCTION public.record_thread_entries_guard();

-- trg_record_thread_entries_envelope: a status_updates entry recomputes the
-- envelope's whose_move, last_update_at and follow_up_due.
CREATE OR REPLACE FUNCTION public.record_thread_entries_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
BEGIN
  IF EXISTS (SELECT 1 FROM public.record_threads AS t WHERE t.id = NEW.thread_id AND t.kind = 'status_updates') THEN
    PERFORM set_config('storm.record_engine', 'on', true);
    UPDATE public.record_envelopes AS e
    SET whose_move = public.record_whose_move(e.id),
        last_update_at = (SELECT max(te.created_at) FROM public.record_thread_entries AS te WHERE te.thread_id = NEW.thread_id),
        follow_up_due = public.record_follow_up_due(e.id)
    WHERE e.id = NEW.envelope_id;
    PERFORM set_config('storm.record_engine', v_prev_flag, true);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_thread_entries_envelope ON public.record_thread_entries;
CREATE TRIGGER trg_record_thread_entries_envelope
  AFTER INSERT OR UPDATE ON public.record_thread_entries
  FOR EACH ROW EXECUTE FUNCTION public.record_thread_entries_envelope();

-- ---------------------------------------------------------------- the thread API

-- Post an update, request or reply, or edit an entry (p_replaces_id), with
-- the threads.ts rules and codes: party = company for a company actor,
-- else vessel for a user who may write the record (record_caller_may_write:
-- reach and no external membership; else 42501, review round 4); requests by
-- the company with a due date (wrong_party, invalid_date); replies by the
-- vessel to an open request (wrong_party, unknown_entry, not_a_request,
-- request_closed); bodies trimmed (empty_body, body_too_long); edits of
-- your own newest non-request entry (unknown_entry, not_editable,
-- not_author, already_edited); never a system entry; record_closed for a
-- closed or void record. Idempotent on p_entry_id. Event thread.<type>
-- (status_request_posted / record_update_posted).
CREATE OR REPLACE FUNCTION public.record_post_thread_entry(
  p_entry_id uuid,
  p_envelope_id uuid,
  p_thread_kind text,
  p_entry_type text,
  p_body text,
  p_follow_up_due date DEFAULT NULL,
  p_request_due date DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL,
  p_replaces_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e public.record_envelopes;
  v_profile uuid;
  v_party text;
  v_thread uuid;
  v_body text := public.record_js_trim(coalesce(p_body, ''));
  v_existing public.record_thread_entries;
  v_original public.record_thread_entries;
  v_parent public.record_thread_entries;
  v_type text;
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
  v_party := CASE
    WHEN public.is_company_actor(v_uid, e.vessel_id) THEN 'company'
    WHEN public.record_caller_may_write(v_uid, e.company_id, e.vessel_id) THEN 'vessel'
  END;
  IF v_party IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = v_uid;

  IF p_entry_id IS NULL OR p_thread_kind IS NULL OR p_thread_kind NOT IN ('status_updates', 'company_review')
     OR p_entry_type IS NULL OR p_entry_type NOT IN ('update', 'request', 'reply') THEN
    RETURN public.record_refusal('invalid_input', 'Choose an update, a request or a reply on the status or review thread.');
  END IF;
  SELECT * INTO v_existing FROM public.record_thread_entries WHERE id = p_entry_id;
  IF FOUND THEN
    IF v_existing.envelope_id = e.id AND v_existing.author_user_id = v_uid THEN
      RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('entry_id', v_existing.id, 'envelope', to_jsonb(e)));
    END IF;
    RETURN public.record_refusal('invalid_input', 'That entry id is already used.');
  END IF;
  IF public.record_impersonating() THEN
    RETURN public.record_refusal('impersonating', 'Updates cannot be posted while acting as another user.');
  END IF;
  IF e.status IN ('closed', 'void') THEN
    RETURN public.record_refusal('record_closed', 'This record is closed.');
  END IF;

  SELECT id INTO v_thread FROM public.record_threads WHERE envelope_id = e.id AND kind = p_thread_kind;

  IF p_replaces_id IS NOT NULL THEN
    -- editEntry()
    SELECT * INTO v_original FROM public.record_thread_entries WHERE id = p_replaces_id AND thread_id = v_thread;
    IF NOT FOUND THEN
      RETURN public.record_refusal('unknown_entry', 'That entry no longer exists.');
    END IF;
    IF v_original.entry_type = 'system' THEN
      RETURN public.record_refusal('not_editable', 'Engine entries cannot be edited.');
    END IF;
    IF v_original.entry_type = 'request' THEN
      RETURN public.record_refusal('not_editable', 'Change a request with "Change date" or "Cancel", or post an update.');
    END IF;
    IF v_original.author_profile_id IS DISTINCT FROM v_profile OR v_profile IS NULL THEN
      RETURN public.record_refusal('not_author', 'Only the author can edit an entry.');
    END IF;
    IF EXISTS (SELECT 1 FROM public.record_thread_entries WHERE replaces_id = v_original.id) THEN
      RETURN public.record_refusal('already_edited', 'Edit the newest version of this entry.');
    END IF;
    IF v_body = '' THEN
      RETURN public.record_refusal('empty_body', 'Write something first.');
    END IF;
    IF length(v_body) > 5000 THEN
      RETURN public.record_refusal('body_too_long', 'Keep it to 5000 characters or fewer.');
    END IF;
    v_type := v_original.entry_type;
    INSERT INTO public.record_thread_entries (id, thread_id, envelope_id, company_id, vessel_id, entry_type, party, author_user_id, author_profile_id,
                                              body, follow_up_due, parent_id, replaces_id, created_at)
    VALUES (p_entry_id, v_thread, e.id, e.company_id, e.vessel_id, v_original.entry_type, v_original.party, v_uid, v_profile,
            v_body, v_original.follow_up_due, v_original.parent_id, v_original.id, clock_timestamp());
  ELSE
    IF p_entry_type = 'request' AND v_party <> 'company' THEN
      RETURN public.record_refusal('wrong_party', 'Only the company can post a request.');
    END IF;
    IF p_entry_type = 'reply' AND v_party <> 'vessel' THEN
      RETURN public.record_refusal('wrong_party', 'Only the vessel replies to a request.');
    END IF;
    IF v_body = '' THEN
      RETURN public.record_refusal('empty_body', 'Write something first.');
    END IF;
    IF length(v_body) > 5000 THEN
      RETURN public.record_refusal('body_too_long', 'Keep it to 5000 characters or fewer.');
    END IF;
    IF p_entry_type = 'request' AND p_request_due IS NULL THEN
      RETURN public.record_refusal('invalid_date', 'A request needs a valid due date.');
    END IF;
    IF p_entry_type = 'reply' THEN
      SELECT * INTO v_parent FROM public.record_thread_entries WHERE id = p_parent_id AND thread_id = v_thread;
      IF NOT FOUND THEN
        RETURN public.record_refusal('unknown_entry', 'That request no longer exists.');
      END IF;
      IF v_parent.entry_type <> 'request' THEN
        RETURN public.record_refusal('not_a_request', 'That entry is not a request.');
      END IF;
      IF v_parent.request_state <> 'open' THEN
        RETURN public.record_refusal('request_closed', format('That request is already %s.', v_parent.request_state));
      END IF;
    END IF;
    v_type := p_entry_type;
    IF v_thread IS NULL THEN
      INSERT INTO public.record_threads (envelope_id, company_id, vessel_id, kind)
      VALUES (e.id, e.company_id, e.vessel_id, p_thread_kind)
      ON CONFLICT (envelope_id, kind) DO NOTHING;
      SELECT id INTO v_thread FROM public.record_threads WHERE envelope_id = e.id AND kind = p_thread_kind;
    END IF;
    INSERT INTO public.record_thread_entries (id, thread_id, envelope_id, company_id, vessel_id, entry_type, party, author_user_id, author_profile_id,
                                              body, follow_up_due, request_due, request_state, parent_id, created_at)
    VALUES (p_entry_id, v_thread, e.id, e.company_id, e.vessel_id, p_entry_type, v_party, v_uid, v_profile, v_body,
            CASE WHEN p_entry_type = 'update' THEN p_follow_up_due END,
            CASE WHEN p_entry_type = 'request' THEN p_request_due END,
            CASE WHEN p_entry_type = 'request' THEN 'open' END,
            CASE WHEN p_entry_type = 'reply' THEN v_parent.id END,
            clock_timestamp());
  END IF;

  PERFORM public.record_log_event(e.id, 'thread.' || CASE WHEN p_replaces_id IS NOT NULL THEN 'edit' ELSE v_type END, v_party,
    jsonb_strip_nulls(jsonb_build_object('entry_id', p_entry_id, 'thread_kind', p_thread_kind, 'entry_type', v_type, 'replaces_id', p_replaces_id, 'parent_id', p_parent_id)),
    NULL, CASE WHEN v_type = 'request' AND p_replaces_id IS NULL THEN 'status_request_posted' ELSE 'record_update_posted' END);

  SELECT * INTO e FROM public.record_envelopes WHERE id = e.id;
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('entry_id', p_entry_id, 'envelope', to_jsonb(e)));
END;
$$;

-- Resolve an open request (the company): done (optional note), cancelled
-- (reason required), change_date (a valid new date, a reason, a different
-- date; the change is appended to due_history). A reader who neither acts
-- for the company nor may write the record gets 42501 (review round 4).
-- Codes as threads.ts
-- (wrong_party, not_a_request, request_closed, invalid_date,
-- reason_required, same_date). Event thread.request_<resolution>.
CREATE OR REPLACE FUNCTION public.record_resolve_thread_request(p_request_id uuid, p_resolution text, p_note text DEFAULT NULL, p_new_due date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  r public.record_thread_entries;
  e public.record_envelopes;
  v_profile uuid;
  v_note text := nullif(public.record_js_trim(coalesce(p_note, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO r FROM public.record_thread_entries WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'entry_not_found';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = r.envelope_id FOR UPDATE;
  IF NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF NOT (public.is_company_actor(v_uid, e.vessel_id) OR public.record_caller_may_write(v_uid, e.company_id, e.vessel_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('done', 'cancelled', 'change_date') THEN
    RETURN public.record_refusal('invalid_input', 'Choose done, cancelled or a new date.');
  END IF;
  IF NOT public.is_company_actor(v_uid, e.vessel_id) THEN
    RETURN public.record_refusal('wrong_party', CASE p_resolution WHEN 'done' THEN 'Only the company can mark a request done.'
                                                                 WHEN 'cancelled' THEN 'Only the company can cancel a request.'
                                                                 ELSE 'Only the company can change a due date.' END);
  END IF;
  IF public.record_impersonating() THEN
    RETURN public.record_refusal('impersonating', 'Requests cannot be changed while acting as another user.');
  END IF;
  SELECT * INTO r FROM public.record_thread_entries WHERE id = p_request_id FOR UPDATE;
  IF r.entry_type <> 'request' THEN
    RETURN public.record_refusal('not_a_request', 'That entry is not a request.');
  END IF;
  IF r.request_state <> 'open' THEN
    RETURN public.record_refusal('request_closed', format('That request is already %s.', r.request_state));
  END IF;
  IF e.status IN ('closed', 'void') THEN
    RETURN public.record_refusal('record_closed', 'This record is closed.');
  END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = v_uid;

  IF p_resolution = 'cancelled' AND v_note IS NULL THEN
    RETURN public.record_refusal('reason_required', 'Say why the request is cancelled.');
  END IF;
  IF p_resolution = 'change_date' THEN
    IF p_new_due IS NULL THEN
      RETURN public.record_refusal('invalid_date', 'Enter a valid due date.');
    END IF;
    IF v_note IS NULL THEN
      RETURN public.record_refusal('reason_required', 'Say why the date is changing.');
    END IF;
    IF p_new_due = r.request_due THEN
      RETURN public.record_refusal('same_date', 'That is already the due date.');
    END IF;
  END IF;

  PERFORM set_config('storm.record_engine', 'on', true);
  IF p_resolution = 'change_date' THEN
    UPDATE public.record_thread_entries
    SET request_due = p_new_due,
        due_history = due_history || jsonb_build_array(jsonb_build_object(
          'from', to_char(r.request_due, 'YYYY-MM-DD'), 'to', to_char(p_new_due, 'YYYY-MM-DD'), 'reason', left(v_note, 2000),
          'changedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'changedBy', v_profile))
    WHERE id = r.id;
  ELSE
    UPDATE public.record_thread_entries
    SET request_state = p_resolution,
        request_resolved_by = v_uid,
        request_resolved_at = now(),
        resolution_note = left(v_note, 2000)
    WHERE id = r.id;
  END IF;
  PERFORM public.record_log_event(e.id, 'thread.request_' || p_resolution, 'company',
    jsonb_strip_nulls(jsonb_build_object('entry_id', r.id, 'new_due', to_char(p_new_due, 'YYYY-MM-DD'))), v_note);
  PERFORM set_config('storm.record_engine', v_prev_flag, true);

  SELECT * INTO e FROM public.record_envelopes WHERE id = e.id;
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('entry_id', r.id, 'envelope', to_jsonb(e)));
END;
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.record_js_trim(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_follow_up_due(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_thread_entries_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_thread_entries_envelope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_post_thread_entry(uuid, uuid, text, text, text, date, date, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_resolve_thread_request(uuid, text, text, date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_js_trim(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_follow_up_due(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_post_thread_entry(uuid, uuid, text, text, text, date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_resolve_thread_request(uuid, text, text, date) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.record_threads IS 'One status_updates thread (TH1: updates, requests, replies; drives whose move and follow-up) and one company_review thread per envelope (D-134). Read: record_readable. No client writes (record_post_thread_entry creates them).';
COMMENT ON TABLE public.record_thread_entries IS 'Thread entries (gap/08 §D): append-only (edits post a replacement); only a request''s state, due date, resolution and due history change, inside the engine. Read: record_readable. No client writes: record_post_thread_entry / record_resolve_thread_request.';
COMMENT ON FUNCTION public.record_js_trim(text) IS 'JS String.prototype.trim() (record engine parity).';
COMMENT ON FUNCTION public.record_follow_up_due(uuid) IS 'followUpDue() of the envelope''s status_updates thread (today = current_date). Internal.';
COMMENT ON FUNCTION public.record_thread_entries_guard() IS 'Trigger: thread entries are append-only except the request fields, inside the engine.';
COMMENT ON FUNCTION public.record_thread_entries_envelope() IS 'Trigger: a status_updates entry recomputes the envelope''s whose_move, last_update_at and follow_up_due.';
COMMENT ON FUNCTION public.record_post_thread_entry(uuid, uuid, text, text, text, date, date, uuid, uuid) IS 'Post an update / request / reply or edit an entry (threads.ts rules and codes); idempotent on the entry id. Party company for a company actor, vessel for a caller who may write the record (record_caller_may_write); anyone else 42501 (an external viewer reads only).';
COMMENT ON FUNCTION public.record_resolve_thread_request(uuid, text, text, date) IS 'The company marks a request done, cancels it (reason) or changes its due date (reason; history kept). A reader who is neither a company actor nor may write the record gets 42501.';
