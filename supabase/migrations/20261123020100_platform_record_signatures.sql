-- =================================================================
-- PLATFORM P4: record engine, unit 2/3: ordered signature slots (gap/08
-- §B, SIG3-SIG12, SIG16-17; DECISIONS D-48, D-51; Phase 2 spec §A.11;
-- proposed D-132, D-134)
-- Tables: record_signature_slots (one row per slot per cycle),
--   record_signatures (append-only except removal / supersession)
-- View: record_signature_slot_states (security_invoker; derived state)
-- Helpers: record_refusal(), record_signature_hash(), record_normalise_office(),
--   record_slot_state(), record_slot_eligible(), record_is_master(),
--   record_instantiate_slots(), record_vessel_completion(),
--   record_sign_slot(), record_pass_slot(), record_cancel_pass(),
--   record_remove_signature(), record_resign_slot()
-- TS mirror: src/lib/records/services/db.pending.ts (record_signature_slots,
--   record_signatures, record_signature_slot_states and the five RPCs);
--   the pure engine src/lib/records/signatures.ts (frozen in Phase 2)
-- Parity: supabase/tests/fixtures/record-signature-scenarios.json, asserted
--   by supabase/tests/sql/p4_signatures
-- =================================================================
--
-- Unit 2 of the record engine (files 20261123020000, 020100, 020200: apply
-- together, in order, in one sitting; CC-18).
--
-- The RPCs mirror signSlot / signBlocker / passSlotTo / cancelPass /
-- removeBlocker / removeSignature / reSignSlot with the same error codes
-- and check order; the server adds what only it can know (the record is
-- closed or void, the slot belongs to an old cycle, the expected version).
-- Signature ids are the client's idempotency key: the same id on the same
-- live slot is a no-op, an id used anywhere else is refused.
--
-- Eligibility (interim until gap/01 vessel_office_holders; D-132): the
-- profile belongs to the record's company and is active (when it has a
-- login); a slot that names people admits exactly those people; otherwise
-- company slots admit company actors (is_company_actor), and vessel slots
-- without an office anyone who reaches the vessel, with an office the
-- holder of a current crew assignment on THIS vessel whose position or
-- rank matches it. On-behalf signing is refused (D-48: no on-behalf
-- predicate yet). The D-51 lock is record_vessel_signatures_locked() of
-- the envelope for the slot's cycle.
--
-- A vessel signature (or re-signature) runs the envelope's vessel_sign
-- transition: every required vessel slot signed -> the company step
-- (awaiting_company_close, or closed for kinds without one), else in
-- review. Removing a vessel signature steps the status back
-- (awaiting_company_close -> in_review; in_review -> open when no vessel
-- signature is left).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.record_envelopes') IS NULL OR to_regprocedure('public.record_engine_apply(uuid,text,text,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.record_digest_of(jsonb,text[])') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020100_platform_record_signatures needs the record registry: apply 20261123020000_platform_record_registry.sql first (the record engine is one unit)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- pure helpers

-- A business refusal as a result envelope.
CREATE OR REPLACE FUNCTION public.record_refusal(p_code text, p_message text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', false, 'error', jsonb_build_object('code', p_code, 'message', p_message))
$$;

-- SIG16 integrity hash: sha256 (hex) of record_digest | slot_id |
-- signer profile (or name) | signed_at (UTC, microseconds) | image sha256.
CREATE OR REPLACE FUNCTION public.record_signature_hash(p_digest text, p_slot_id uuid, p_signer_profile_id uuid, p_signer_name text, p_signed_at timestamptz, p_image_sha256 text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    coalesce(p_digest, ''),
    coalesce(p_slot_id::text, ''),
    coalesce(p_signer_profile_id::text, p_signer_name, ''),
    to_char(p_signed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(p_image_sha256, '')), 'UTF8')), 'hex')
$$;

-- An office, position or rank as a snake_case key ('Chief Officer' -> chief_officer).
CREATE OR REPLACE FUNCTION public.record_normalise_office(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT nullif(btrim(regexp_replace(translate(btrim(coalesce(p_text, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_'), '')
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.record_signature_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL,
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  cycle integer NOT NULL,
  slot_key text NOT NULL,
  label text NOT NULL,
  order_no integer NOT NULL,
  party text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  office_key text NULL,
  named_profile_ids uuid[] NOT NULL DEFAULT '{}',
  covers_sections text[] NULL,
  allow_witnessed boolean NOT NULL,
  allow_visitor boolean NOT NULL DEFAULT false,
  allow_on_behalf boolean NOT NULL DEFAULT false,
  on_behalf_reason_required boolean NOT NULL DEFAULT false,
  distinct_from text[] NOT NULL DEFAULT '{}',
  passed_to_profile_id uuid NULL,
  passed_at timestamptz NULL,
  passed_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_signature_slots_pkey PRIMARY KEY (id),
  CONSTRAINT record_signature_slots_envelope_id_fkey FOREIGN KEY (envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_signature_slots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT record_signature_slots_passed_to_profile_id_fkey FOREIGN KEY (passed_to_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT record_signature_slots_passed_by_fkey FOREIGN KEY (passed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_signature_slots_envelope_cycle_key UNIQUE (envelope_id, cycle, slot_key),
  CONSTRAINT record_signature_slots_cycle_check CHECK (cycle >= 1),
  CONSTRAINT record_signature_slots_slot_key_check CHECK (slot_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT record_signature_slots_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  CONSTRAINT record_signature_slots_order_no_check CHECK (order_no >= 1),
  CONSTRAINT record_signature_slots_party_check CHECK (party IN ('vessel', 'company')),
  CONSTRAINT record_signature_slots_company_party_check CHECK (party <> 'company' OR (NOT allow_visitor AND NOT allow_on_behalf)),
  CONSTRAINT record_signature_slots_pass_check CHECK ((passed_to_profile_id IS NULL) = (passed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_record_signature_slots_envelope ON public.record_signature_slots (envelope_id, cycle, order_no);

CREATE TABLE IF NOT EXISTS public.record_signatures (
  id uuid NOT NULL,
  envelope_id uuid NOT NULL,
  slot_id uuid NULL,
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  cycle integer NOT NULL,
  slot_key text NULL,
  party text NOT NULL,
  signer_user_id uuid NULL,
  signer_profile_id uuid NULL,
  signer_name text NOT NULL,
  signer_kind text NOT NULL,
  visitor_company text NULL,
  visitor_capacity text NULL,
  method text NOT NULL,
  witness_profile_id uuid NULL,
  witness_user_id uuid NULL,
  on_behalf_of_office text NULL,
  on_behalf_reason text NULL,
  decision text NULL,
  comment text NULL,
  image_path text NULL,
  image_sha256 text NULL,
  record_digest text NOT NULL,
  record_version integer NOT NULL,
  integrity_hash text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  impersonator_user_id uuid NULL,
  removed_at timestamptz NULL,
  removed_by uuid NULL,
  removal_reason text NULL,
  superseded_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_signatures_pkey PRIMARY KEY (id),
  CONSTRAINT record_signatures_envelope_id_fkey FOREIGN KEY (envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_signatures_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.record_signature_slots(id) ON DELETE RESTRICT,
  CONSTRAINT record_signatures_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT record_signatures_signer_profile_id_fkey FOREIGN KEY (signer_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT record_signatures_party_check CHECK (party IN ('vessel', 'company')),
  CONSTRAINT record_signatures_signer_name_check CHECK (length(signer_name) BETWEEN 1 AND 120),
  CONSTRAINT record_signatures_signer_kind_check CHECK (signer_kind IN ('crew', 'shore', 'visitor', 'contractor')),
  CONSTRAINT record_signatures_method_check CHECK (method IN ('verified', 'witnessed', 'on_behalf')),
  CONSTRAINT record_signatures_decision_check CHECK (decision IS NULL OR decision IN ('acknowledged', 'approved', 'approved_with_conditions', 'not_approved', 'signed_off')),
  CONSTRAINT record_signatures_comment_check CHECK (comment IS NULL OR length(comment) <= 2000),
  CONSTRAINT record_signatures_image_sha256_check CHECK (image_sha256 IS NULL OR image_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT record_signatures_integrity_hash_check CHECK (integrity_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT record_signatures_removal_reason_check CHECK (removal_reason IS NULL OR length(removal_reason) <= 500),
  CONSTRAINT record_signatures_slot_or_decision_check CHECK (slot_id IS NOT NULL OR (party = 'company' AND decision IS NOT NULL)),
  CONSTRAINT record_signatures_witness_check CHECK (method <> 'witnessed' OR witness_profile_id IS NOT NULL),
  CONSTRAINT record_signatures_visitor_check CHECK (signer_kind NOT IN ('visitor', 'contractor') OR (signer_profile_id IS NULL AND visitor_company IS NOT NULL AND visitor_capacity IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS record_signatures_live_slot_key ON public.record_signatures (slot_id) WHERE slot_id IS NOT NULL AND removed_at IS NULL AND superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_record_signatures_envelope ON public.record_signatures (envelope_id, cycle);

ALTER TABLE public.record_signature_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.record_signature_slots FROM anon, authenticated;
REVOKE ALL ON TABLE public.record_signatures FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_signature_slots TO authenticated;
GRANT SELECT ON TABLE public.record_signatures TO authenticated;
GRANT ALL ON TABLE public.record_signature_slots TO service_role;
GRANT ALL ON TABLE public.record_signatures TO service_role;

DROP TRIGGER IF EXISTS trg_record_signature_slots_updated_at ON public.record_signature_slots;
CREATE TRIGGER trg_record_signature_slots_updated_at
  BEFORE UPDATE ON public.record_signature_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS record_signature_slots_select ON public.record_signature_slots;
CREATE POLICY record_signature_slots_select ON public.record_signature_slots
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

DROP POLICY IF EXISTS record_signatures_select ON public.record_signatures;
CREATE POLICY record_signatures_select ON public.record_signatures
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

-- trg_record_signatures_guard: never deleted; an UPDATE may only set
-- removed_at / removed_by / removal_reason / superseded_at, once each, and
-- only inside the engine (storm.record_engine); a deleted profile may set
-- signer_profile_id to NULL (referential action).
CREATE OR REPLACE FUNCTION public.record_signatures_guard()
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
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_history_is_append_only', DETAIL = 'Signatures are removed or superseded, never deleted.';
  END IF;
  v_old := to_jsonb(OLD) - ARRAY['removed_at', 'removed_by', 'removal_reason', 'superseded_at'];
  v_new := to_jsonb(NEW) - ARRAY['removed_at', 'removed_by', 'removal_reason', 'superseded_at'];
  IF NEW.signer_profile_id IS NULL AND OLD.signer_profile_id IS NOT NULL THEN
    v_old := v_old - 'signer_profile_id';
    v_new := v_new - 'signer_profile_id';
  END IF;
  IF v_old IS DISTINCT FROM v_new THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_history_is_append_only', DETAIL = 'A signature is never edited.';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['removed_at', 'removed_by', 'removal_reason', 'superseded_at'] LOOP
    IF (to_jsonb(NEW) -> v_col) IS DISTINCT FROM (to_jsonb(OLD) -> v_col) THEN
      IF current_setting('storm.record_engine', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_status_is_server_owned', DETAIL = 'Only the record engine removes or supersedes a signature.';
      END IF;
      IF (to_jsonb(OLD) -> v_col) <> 'null'::jsonb THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_history_is_append_only', DETAIL = 'A removal or supersession is recorded once.';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_signatures_guard ON public.record_signatures;
CREATE TRIGGER trg_record_signatures_guard
  BEFORE UPDATE OR DELETE ON public.record_signatures
  FOR EACH ROW EXECUTE FUNCTION public.record_signatures_guard();

-- ---------------------------------------------------------------- the slot-state view

-- slotState() (signatures.ts) per slot and cycle: signed (a live
-- signature), waiting (an earlier-ordered required slot of the same cycle
-- is unsigned), requested (passed to someone), else open; and stale (the
-- live signature's digest differs from the covered sections' digest).
-- security_invoker: the record tables' RLS applies to the reader.
CREATE OR REPLACE VIEW public.record_signature_slot_states
WITH (security_invoker = true) AS
SELECT
  sl.id AS slot_id,
  sl.envelope_id,
  sl.company_id,
  sl.vessel_id,
  sl.cycle,
  sl.slot_key,
  sl.label,
  sl.order_no,
  sl.party,
  sl.required,
  CASE
    WHEN live.id IS NOT NULL THEN 'signed'
    WHEN EXISTS (
      SELECT 1 FROM public.record_signature_slots AS o
      WHERE o.envelope_id = sl.envelope_id AND o.cycle = sl.cycle AND o.order_no < sl.order_no AND o.required
        AND NOT EXISTS (SELECT 1 FROM public.record_signatures AS s2 WHERE s2.slot_id = o.id AND s2.removed_at IS NULL AND s2.superseded_at IS NULL)
    ) THEN 'waiting'
    WHEN sl.passed_to_profile_id IS NOT NULL THEN 'requested'
    ELSE 'open'
  END AS state,
  live.id AS live_signature_id,
  (live.id IS NOT NULL AND live.record_digest IS DISTINCT FROM public.record_digest_of(e.section_digests, sl.covers_sections)) AS stale,
  sl.passed_to_profile_id,
  sl.passed_at
FROM public.record_signature_slots AS sl
JOIN public.record_envelopes AS e ON e.id = sl.envelope_id
LEFT JOIN LATERAL (
  SELECT s.id, s.record_digest
  FROM public.record_signatures AS s
  WHERE s.slot_id = sl.id AND s.removed_at IS NULL AND s.superseded_at IS NULL
  LIMIT 1
) AS live ON true;

REVOKE ALL ON TABLE public.record_signature_slot_states FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_signature_slot_states TO authenticated, service_role;

-- ---------------------------------------------------------------- engine internals (service role)

-- The state of one slot, as the view computes it (definers read the
-- tables directly).
CREATE OR REPLACE FUNCTION public.record_slot_state(p_slot_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.record_signatures AS s WHERE s.slot_id = sl.id AND s.removed_at IS NULL AND s.superseded_at IS NULL) THEN 'signed'
    WHEN EXISTS (
      SELECT 1 FROM public.record_signature_slots AS o
      WHERE o.envelope_id = sl.envelope_id AND o.cycle = sl.cycle AND o.order_no < sl.order_no AND o.required
        AND NOT EXISTS (SELECT 1 FROM public.record_signatures AS s2 WHERE s2.slot_id = o.id AND s2.removed_at IS NULL AND s2.superseded_at IS NULL)
    ) THEN 'waiting'
    WHEN sl.passed_to_profile_id IS NOT NULL THEN 'requested'
    ELSE 'open'
  END
  FROM public.record_signature_slots AS sl
  WHERE sl.id = p_slot_id
$$;

-- The Master of the vessel: a current crew assignment on it whose position
-- or rank is master / captain.
CREATE OR REPLACE FUNCTION public.record_is_master(p_user_id uuid, p_vessel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND p_vessel_id IS NOT NULL AND public.user_is_active(p_user_id) AND EXISTS (
    SELECT 1 FROM public.crew_assignments AS ca
    WHERE ca.user_id = p_user_id AND ca.vessel_id = p_vessel_id AND ca.is_current
      AND (public.record_normalise_office(ca.position) IN ('master', 'captain') OR public.record_normalise_office(ca.rank) IN ('master', 'captain'))
  )
$$;

-- May the profile sign the slot? (interim eligibility, see the header.)
-- Unknown slot / profile / office -> false.
CREATE OR REPLACE FUNCTION public.record_slot_eligible(p_slot_id uuid, p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_company uuid;
  v_vessel uuid;
  v_profile record;
BEGIN
  IF p_slot_id IS NULL OR p_profile_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT sl.party, sl.named_profile_ids, sl.office_key, sl.envelope_id INTO v_slot FROM public.record_signature_slots AS sl WHERE sl.id = p_slot_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT e.company_id, e.vessel_id INTO v_company, v_vessel FROM public.record_envelopes AS e WHERE e.id = v_slot.envelope_id;
  SELECT p.id, p.user_id, p.company_id INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_profile.company_id IS DISTINCT FROM v_company THEN
    RETURN false;
  END IF;
  IF v_profile.user_id IS NOT NULL AND NOT public.user_is_active(v_profile.user_id) THEN
    RETURN false;
  END IF;
  IF v_slot.party = 'company' THEN
    RETURN v_profile.user_id IS NOT NULL
       AND public.is_company_actor(v_profile.user_id, v_vessel)
       AND (cardinality(v_slot.named_profile_ids) = 0 OR p_profile_id = ANY (v_slot.named_profile_ids));
  END IF;
  IF cardinality(v_slot.named_profile_ids) > 0 THEN
    RETURN p_profile_id = ANY (v_slot.named_profile_ids);
  END IF;
  IF v_profile.user_id IS NULL THEN
    RETURN false;
  END IF;
  IF v_slot.office_key IS NULL THEN
    RETURN CASE WHEN v_vessel IS NULL THEN public.fleet_reach_for(v_profile.user_id, v_company) ELSE public.reach_vessel_for(v_profile.user_id, v_vessel) END;
  END IF;
  RETURN v_vessel IS NOT NULL AND public.reach_vessel_for(v_profile.user_id, v_vessel) AND EXISTS (
    SELECT 1 FROM public.crew_assignments AS ca
    WHERE ca.user_id = v_profile.user_id AND ca.vessel_id = v_vessel AND ca.is_current
      AND public.record_normalise_office(v_slot.office_key) IN (public.record_normalise_office(ca.position), public.record_normalise_office(ca.rank))
  );
END;
$$;

-- The kind template's slots for one cycle of an envelope; returns how
-- many were created (existing ones are kept).
CREATE OR REPLACE FUNCTION public.record_instantiate_slots(p_envelope_id uuid, p_cycle integer)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.record_signature_slots (
    envelope_id, company_id, vessel_id, cycle, slot_key, label, order_no, party, required, office_key, named_profile_ids,
    covers_sections, allow_witnessed, allow_visitor, allow_on_behalf, on_behalf_reason_required, distinct_from
  )
  SELECT e.id, e.company_id, e.vessel_id, p_cycle,
         t ->> 'key',
         btrim(t ->> 'label'),
         (t ->> 'order')::integer,
         t ->> 'party',
         coalesce((t ->> 'required')::boolean, true),
         nullif(btrim(coalesce(t ->> 'office_key', '')), ''),
         coalesce(ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(t -> 'named_profile_ids') = 'array' THEN t -> 'named_profile_ids' ELSE '[]'::jsonb END) AS x), '{}'),
         CASE WHEN jsonb_typeof(t -> 'covers_sections') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(t -> 'covers_sections')) END,
         coalesce((t ->> 'allow_witnessed')::boolean, t ->> 'party' = 'vessel'),
         coalesce((t ->> 'allow_visitor')::boolean, false),
         coalesce((t ->> 'allow_on_behalf')::boolean, false),
         coalesce((t ->> 'on_behalf_reason_required')::boolean, false),
         coalesce(ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(t -> 'distinct_from') = 'array' THEN t -> 'distinct_from' ELSE '[]'::jsonb END)), '{}')
  FROM public.record_envelopes AS e
  JOIN public.record_kinds AS k ON k.key = e.kind_key
  CROSS JOIN LATERAL jsonb_array_elements(k.slot_template) AS t
  WHERE e.id = p_envelope_id
  ON CONFLICT (envelope_id, cycle, slot_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- After a vessel signature: every required vessel slot signed -> the
-- vessel_sign transition with allVesselSlotsSigned (refused, e.g. a stale
-- signature: nothing changes); otherwise, from open / acknowledged /
-- info_requested, vessel_sign to in_review.
CREATE OR REPLACE FUNCTION public.record_vessel_completion(p_envelope_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_result jsonb;
BEGIN
  IF public.record_vessel_slots_complete(p_envelope_id) THEN
    v_result := public.record_transition_decide(public.record_state_of(p_envelope_id), jsonb_build_object(
      'action', 'vessel_sign', 'actor', 'vessel', 'allVesselSlotsSigned', true,
      'staleRequiredSignatures', public.record_stale_required(p_envelope_id),
      'openRequests', public.record_open_requests(p_envelope_id)));
    IF (v_result ->> 'ok')::boolean THEN
      PERFORM public.record_engine_apply(p_envelope_id, 'vessel_sign', 'vessel', v_result -> 'value', '{}'::jsonb);
      RETURN;
    END IF;
  END IF;
  SELECT status INTO v_status FROM public.record_envelopes WHERE id = p_envelope_id;
  IF v_status IN ('open', 'acknowledged', 'info_requested') THEN
    v_result := public.record_transition_decide(public.record_state_of(p_envelope_id), jsonb_build_object('action', 'vessel_sign', 'actor', 'vessel', 'allVesselSlotsSigned', false));
    IF (v_result ->> 'ok')::boolean THEN
      PERFORM public.record_engine_apply(p_envelope_id, 'vessel_sign', 'vessel', v_result -> 'value', '{}'::jsonb);
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------- the signing API

-- signSlot() / signBlocker(): idempotent replay, id conflict, impersonation,
-- version, closed / void, old cycle, signed / waiting, then per method
-- (verified: eligible; witnessed: allowed, write access, a signer, not the
-- witness, visitors where allowed, an eligible crew signer; on_behalf:
-- allowed, write access, then not_eligible, D-48), then separation of
-- duties. On success: the signature, the slot's pass cleared, events
-- (signature.signed; signature.slot_opened with signature_requested for
-- each slot it opened), and the vessel_sign transition for a vessel slot.
CREATE OR REPLACE FUNCTION public.record_sign_slot(
  p_signature_id uuid,
  p_slot_id uuid,
  p_method text,
  p_signer_profile_id uuid DEFAULT NULL,
  p_visitor jsonb DEFAULT NULL,
  p_on_behalf_of_office text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  sl public.record_signature_slots;
  e public.record_envelopes;
  v_caller public.profiles;
  v_signer public.profiles;
  v_existing public.record_signatures;
  v_state text;
  v_signer_profile uuid;
  v_signer_user uuid;
  v_signer_name text;
  v_signer_kind text;
  v_visitor_company text;
  v_visitor_capacity text;
  v_creator uuid;
  v_digest text;
  v_signed_at timestamptz := clock_timestamp();
  v_waiting uuid[];
  v_opened record;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO sl FROM public.record_signature_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'slot_not_found';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = sl.envelope_id FOR UPDATE;
  IF NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO v_caller FROM public.profiles WHERE user_id = v_uid;

  -- Idempotency on the client id (before anything else, like idReuse()).
  IF p_signature_id IS NULL THEN
    RETURN public.record_refusal('invalid_input', 'The signature id is missing.');
  END IF;
  SELECT * INTO v_existing FROM public.record_signatures WHERE id = p_signature_id;
  IF FOUND THEN
    IF v_existing.slot_id = sl.id AND v_existing.cycle = e.current_cycle AND v_existing.removed_at IS NULL AND v_existing.superseded_at IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('signature_id', v_existing.id, 'envelope', to_jsonb(e)));
    END IF;
    RETURN public.record_refusal('invalid_input', 'That signature id is already used on this record.');
  END IF;
  IF public.record_impersonating() THEN
    RETURN public.record_refusal('impersonating', 'Signatures cannot be made while acting as another user.');
  END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> e.version THEN
    RETURN public.record_refusal('version_conflict', 'This record changed since you opened it. Reload to see the latest version.');
  END IF;
  IF e.status IN ('closed', 'void') OR sl.cycle <> e.current_cycle THEN
    RETURN public.record_refusal('not_open', 'This record is not open for signatures.');
  END IF;

  v_state := public.record_slot_state(sl.id);
  IF v_state = 'signed' THEN
    RETURN public.record_refusal('slot_signed', format('The %s slot is already signed.', sl.label));
  END IF;
  IF v_state = 'waiting' THEN
    RETURN public.record_refusal('slot_waiting', format('%s must wait for the earlier signature first.', sl.label));
  END IF;

  IF p_method = 'verified' THEN
    IF v_caller.id IS NULL OR NOT public.record_slot_eligible(sl.id, v_caller.id) THEN
      RETURN public.record_refusal('not_eligible', format('You can''t sign as %s on this record.', sl.label));
    END IF;
    v_signer_profile := v_caller.id;
    v_signer_user := v_uid;
    v_signer_name := btrim(coalesce(v_caller.first_name, '') || ' ' || coalesce(v_caller.last_name, ''));
    v_signer_kind := CASE WHEN sl.party = 'company' THEN 'shore' ELSE 'crew' END;
  ELSIF p_method = 'witnessed' THEN
    IF NOT sl.allow_witnessed THEN
      RETURN public.record_refusal('method_not_allowed', format('The %s slot can''t be signed on someone else''s behalf on this device.', sl.label));
    END IF;
    IF NOT public.record_caller_reaches(v_uid, e.company_id, e.vessel_id) THEN
      RETURN public.record_refusal('no_write_access', 'You need write access to this record to witness a signature.');
    END IF;
    IF p_signer_profile_id IS NOT NULL THEN
      SELECT * INTO v_signer FROM public.profiles WHERE id = p_signer_profile_id;
      IF NOT FOUND THEN
        RETURN public.record_refusal('invalid_input', 'Choose who is signing.');
      END IF;
      IF v_signer.id = v_caller.id THEN
        RETURN public.record_refusal('witness_is_signer', 'Signing yourself? Use "Sign as me".');
      END IF;
      IF NOT public.record_slot_eligible(sl.id, v_signer.id) THEN
        RETURN public.record_refusal('not_eligible', format('That person can''t sign as %s on this record.', sl.label));
      END IF;
      v_signer_profile := v_signer.id;
      v_signer_user := v_signer.user_id;
      v_signer_name := btrim(coalesce(v_signer.first_name, '') || ' ' || coalesce(v_signer.last_name, ''));
      v_signer_kind := CASE WHEN sl.party = 'company' THEN 'shore' ELSE 'crew' END;
    ELSIF p_visitor IS NOT NULL AND jsonb_typeof(p_visitor) = 'object' AND NOT public.record_text_blank(p_visitor ->> 'name') THEN
      IF NOT sl.allow_visitor THEN
        RETURN public.record_refusal('visitor_not_allowed', format('A visitor or contractor can''t sign the %s slot.', sl.label));
      END IF;
      v_visitor_company := nullif(btrim(coalesce(p_visitor ->> 'company', '')), '');
      v_visitor_capacity := nullif(btrim(coalesce(p_visitor ->> 'capacity', '')), '');
      IF v_visitor_company IS NULL OR v_visitor_capacity IS NULL OR length(btrim(p_visitor ->> 'name')) > 120 THEN
        RETURN public.record_refusal('invalid_input', 'Give the visitor''s name, company and capacity.');
      END IF;
      v_signer_name := btrim(p_visitor ->> 'name');
      v_signer_kind := CASE WHEN p_visitor ->> 'kind' = 'contractor' THEN 'contractor' ELSE 'visitor' END;
    ELSE
      RETURN public.record_refusal('invalid_input', 'Choose who is signing.');
    END IF;
  ELSIF p_method = 'on_behalf' THEN
    IF NOT sl.allow_on_behalf THEN
      RETURN public.record_refusal('method_not_allowed', format('The %s slot can''t be signed on someone''s behalf.', sl.label));
    END IF;
    IF NOT public.record_caller_reaches(v_uid, e.company_id, e.vessel_id) THEN
      RETURN public.record_refusal('no_write_access', 'You need write access to this record to sign on behalf.');
    END IF;
    -- D-48: no on-behalf predicate exists yet; fail closed.
    RETURN public.record_refusal('not_eligible', format('You can''t sign on the %s''s behalf on this record.', sl.label));
  ELSE
    RETURN public.record_refusal('invalid_input', 'Unknown signing method.');
  END IF;

  -- Separation of duties (distinctFrom; 'creator' = the opener's profile).
  IF v_signer_profile IS NOT NULL THEN
    SELECT p.id INTO v_creator FROM public.profiles AS p WHERE p.user_id = e.opened_by;
    IF 'creator' = ANY (sl.distinct_from) AND v_creator IS NOT NULL AND v_signer_profile = v_creator THEN
      RETURN public.record_refusal('separation_of_duties', format('The person who created this record can''t sign as %s.', sl.label));
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.record_signatures AS s
      JOIN public.record_signature_slots AS o ON o.id = s.slot_id
      WHERE s.envelope_id = e.id AND s.cycle = e.current_cycle AND s.removed_at IS NULL AND s.superseded_at IS NULL
        AND s.signer_profile_id = v_signer_profile
        AND (o.slot_key = ANY (sl.distinct_from) OR sl.slot_key = ANY (o.distinct_from))
    ) THEN
      RETURN public.record_refusal('separation_of_duties', format('The same person can''t sign two slots that must be signed by different people (%s).', sl.label));
    END IF;
  END IF;

  -- The slots of this cycle waiting now (to tell who may sign next).
  v_waiting := ARRAY(SELECT o.id FROM public.record_signature_slots AS o WHERE o.envelope_id = e.id AND o.cycle = e.current_cycle AND public.record_slot_state(o.id) = 'waiting');

  v_digest := public.record_digest_of(e.section_digests, sl.covers_sections);
  PERFORM set_config('storm.record_engine', 'on', true);
  INSERT INTO public.record_signatures (
    id, envelope_id, slot_id, company_id, vessel_id, cycle, slot_key, party, signer_user_id, signer_profile_id, signer_name,
    signer_kind, visitor_company, visitor_capacity, method, witness_profile_id, witness_user_id, image_path,
    record_digest, record_version, integrity_hash, signed_at
  ) VALUES (
    p_signature_id, e.id, sl.id, e.company_id, e.vessel_id, sl.cycle, sl.slot_key, sl.party, v_signer_user, v_signer_profile,
    left(coalesce(nullif(v_signer_name, ''), 'Signer'), 120), v_signer_kind, v_visitor_company, v_visitor_capacity, p_method,
    CASE WHEN p_method = 'witnessed' THEN v_caller.id END, CASE WHEN p_method = 'witnessed' THEN v_uid END, nullif(btrim(coalesce(p_image_path, '')), ''),
    v_digest, e.version, public.record_signature_hash(v_digest, sl.id, v_signer_profile, v_signer_name, v_signed_at, NULL), v_signed_at
  );
  UPDATE public.record_signature_slots SET passed_to_profile_id = NULL, passed_at = NULL, passed_by = NULL WHERE id = sl.id AND passed_to_profile_id IS NOT NULL;

  PERFORM public.record_log_event(e.id, 'signature.signed', sl.party,
    jsonb_build_object('signature_id', p_signature_id, 'slot_id', sl.id, 'slot_key', sl.slot_key, 'method', p_method, 'cycle', sl.cycle));
  FOR v_opened IN
    SELECT o.id, o.slot_key, o.named_profile_ids
    FROM public.record_signature_slots AS o
    WHERE o.id = ANY (v_waiting) AND public.record_slot_state(o.id) IN ('open', 'requested')
    ORDER BY o.order_no, o.slot_key
  LOOP
    PERFORM public.record_log_event(e.id, 'signature.slot_opened', sl.party,
      jsonb_build_object('slot_id', v_opened.id, 'slot_key', v_opened.slot_key,
        'must_act_user_ids', coalesce((SELECT jsonb_agg(p.user_id ORDER BY p.user_id) FROM public.profiles AS p
                                       WHERE p.id = ANY (v_opened.named_profile_ids) AND p.user_id IS NOT NULL), '[]'::jsonb)),
      NULL, 'signature_requested');
  END LOOP;

  IF sl.party = 'vessel' THEN
    PERFORM public.record_vessel_completion(e.id);
  END IF;
  PERFORM set_config('storm.record_engine', v_prev_flag, true);

  SELECT * INTO e FROM public.record_envelopes WHERE id = e.id;
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('signature_id', p_signature_id, 'envelope', to_jsonb(e)));
END;
$$;

-- passSlotTo(): an open slot only (not_open when waiting, signed or
-- already passed), to an eligible person; event signature.passed with
-- signature_requested for the person it was passed to.
CREATE OR REPLACE FUNCTION public.record_pass_slot(p_slot_id uuid, p_to_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  sl public.record_signature_slots;
  e public.record_envelopes;
  v_state text;
  v_target_user uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO sl FROM public.record_signature_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'slot_not_found';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = sl.envelope_id FOR UPDATE;
  IF NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF public.record_impersonating() THEN
    RETURN public.record_refusal('impersonating', 'Signature requests cannot be made while acting as another user.');
  END IF;
  IF e.status IN ('closed', 'void') OR sl.cycle <> e.current_cycle THEN
    RETURN public.record_refusal('not_open', 'This record is not open for signatures.');
  END IF;
  v_state := public.record_slot_state(sl.id);
  IF v_state = 'requested' THEN
    RETURN public.record_refusal('not_open', format('The %s slot is already passed to someone. Cancel that first.', sl.label));
  END IF;
  IF v_state <> 'open' THEN
    RETURN public.record_refusal('not_open', format('The %s slot can''t be passed on yet.', sl.label));
  END IF;
  IF NOT public.record_slot_eligible(sl.id, p_to_profile_id) THEN
    RETURN public.record_refusal('not_eligible', format('That person can''t sign as %s on this record.', sl.label));
  END IF;
  UPDATE public.record_signature_slots SET passed_to_profile_id = p_to_profile_id, passed_at = now(), passed_by = v_uid WHERE id = sl.id;
  SELECT user_id INTO v_target_user FROM public.profiles WHERE id = p_to_profile_id;
  PERFORM public.record_log_event(e.id, 'signature.passed', sl.party,
    jsonb_build_object('slot_id', sl.id, 'slot_key', sl.slot_key, 'to_profile_id', p_to_profile_id,
      'must_act_user_ids', CASE WHEN v_target_user IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_target_user) END),
    NULL, 'signature_requested');
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('slot_id', sl.id, 'envelope', to_jsonb(e)));
END;
$$;

-- cancelPass(): a requested slot back to open (not_requested otherwise).
CREATE OR REPLACE FUNCTION public.record_cancel_pass(p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  sl public.record_signature_slots;
  e public.record_envelopes;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO sl FROM public.record_signature_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'slot_not_found';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = sl.envelope_id FOR UPDATE;
  IF NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF public.record_impersonating() THEN
    RETURN public.record_refusal('impersonating', 'Signature requests cannot be changed while acting as another user.');
  END IF;
  IF public.record_slot_state(sl.id) <> 'requested' THEN
    RETURN public.record_refusal('not_requested', format('The %s slot has not been passed to anyone.', sl.label));
  END IF;
  UPDATE public.record_signature_slots SET passed_to_profile_id = NULL, passed_at = NULL, passed_by = NULL WHERE id = sl.id;
  PERFORM public.record_log_event(e.id, 'signature.pass_cancelled', sl.party, jsonb_build_object('slot_id', sl.id, 'slot_key', sl.slot_key));
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('slot_id', sl.id, 'envelope', to_jsonb(e)));
END;
$$;

-- removeBlocker() / removeSignature(): impersonation, the live signature of
-- the slot (not_signed), closed / void (not_open), the D-51 lock for vessel
-- slots (company_acknowledged), reverse order (not_latest), who may remove
-- (signer, witness, the Master for vessel slots, a company actor for
-- company slots: not_allowed), a reason once submitted (reason_required).
-- A required slot's removal clears the passes of the slots now waiting;
-- the status steps back for a vessel slot.
CREATE OR REPLACE FUNCTION public.record_remove_signature(p_signature_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  sg public.record_signatures;
  sl public.record_signature_slots;
  e public.record_envelopes;
  v_caller uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new_status text;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO sg FROM public.record_signatures WHERE id = p_signature_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'signature_not_found';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = sg.envelope_id FOR UPDATE;
  IF NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF public.record_impersonating() THEN
    RETURN public.record_refusal('impersonating', 'Signatures cannot be removed while acting as another user.');
  END IF;
  IF sg.slot_id IS NULL THEN
    RETURN public.record_refusal('not_allowed', 'A company decision is removed with "Remove company signature".');
  END IF;
  SELECT * INTO sl FROM public.record_signature_slots WHERE id = sg.slot_id;
  IF sg.removed_at IS NOT NULL OR sg.superseded_at IS NOT NULL OR sg.cycle <> e.current_cycle THEN
    RETURN public.record_refusal('not_signed', format('The %s slot is not signed.', sl.label));
  END IF;
  IF sl.party = 'vessel' AND public.record_vessel_signatures_locked(public.record_state_of(e.id), sl.cycle) THEN
    RETURN public.record_refusal('company_acknowledged', 'The company has acknowledged this record. Ask the company to return it to the vessel before removing a vessel signature.');
  END IF;
  IF e.status IN ('closed', 'void') THEN
    RETURN public.record_refusal('not_open', 'This record is closed.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.record_signatures AS s
    JOIN public.record_signature_slots AS o ON o.id = s.slot_id
    WHERE s.envelope_id = e.id AND s.cycle = e.current_cycle AND s.removed_at IS NULL AND s.superseded_at IS NULL AND o.order_no > sl.order_no
  ) THEN
    RETURN public.record_refusal('not_latest', 'Signatures are removed in reverse order. Remove the later signatures first.');
  END IF;
  SELECT id INTO v_caller FROM public.profiles WHERE user_id = v_uid;
  IF NOT coalesce(
    (v_caller IS NOT NULL AND (sg.signer_profile_id IS NOT DISTINCT FROM v_caller OR sg.witness_profile_id IS NOT DISTINCT FROM v_caller))
    OR (sl.party = 'vessel' AND public.record_is_master(v_uid, e.vessel_id))
    OR (sl.party = 'company' AND public.is_company_actor(v_uid, e.vessel_id)),
    false
  ) THEN
    RETURN public.record_refusal('not_allowed', 'Only the signer, the Master (vessel slots) or the company (company slots) can remove this signature.');
  END IF;
  IF e.submitted_at IS NOT NULL AND v_reason IS NULL THEN
    RETURN public.record_refusal('reason_required', 'Give a reason for removing a signature from a submitted record.');
  END IF;

  PERFORM set_config('storm.record_engine', 'on', true);
  UPDATE public.record_signatures SET removed_at = now(), removed_by = v_uid, removal_reason = left(v_reason, 500) WHERE id = sg.id;
  -- Slots after this one that now wait lose their pass requests.
  UPDATE public.record_signature_slots AS o
  SET passed_to_profile_id = NULL, passed_at = NULL, passed_by = NULL
  WHERE o.envelope_id = e.id AND o.cycle = sl.cycle AND o.order_no > sl.order_no AND o.passed_to_profile_id IS NOT NULL
    AND public.record_slot_state(o.id) = 'waiting';
  PERFORM public.record_log_event(e.id, 'signature.removed', sl.party,
    jsonb_build_object('signature_id', sg.id, 'slot_id', sl.id, 'slot_key', sl.slot_key, 'cycle', sl.cycle), v_reason);

  IF sl.party = 'vessel' THEN
    v_new_status := CASE
      WHEN e.status = 'awaiting_company_close' AND NOT public.record_vessel_slots_complete(e.id) THEN
        CASE WHEN EXISTS (SELECT 1 FROM public.record_signatures AS s WHERE s.envelope_id = e.id AND s.cycle = e.current_cycle AND s.party = 'vessel'
                                                                    AND s.removed_at IS NULL AND s.superseded_at IS NULL)
             THEN 'in_review' ELSE 'open' END
      WHEN e.status = 'in_review' AND NOT EXISTS (SELECT 1 FROM public.record_signatures AS s WHERE s.envelope_id = e.id AND s.cycle = e.current_cycle AND s.party = 'vessel'
                                                                                         AND s.removed_at IS NULL AND s.superseded_at IS NULL)
        THEN 'open'
    END;
    IF v_new_status IS NOT NULL THEN
      UPDATE public.record_envelopes SET status = v_new_status, version = version + 1 WHERE id = e.id;
      UPDATE public.record_envelopes SET whose_move = public.record_whose_move(e.id) WHERE id = e.id;
      INSERT INTO public.record_events (company_id, vessel_id, module_key, kind_key, envelope_id, entity_id, reference, action, party, actor_user_id, from_status, to_status, cycle, payload)
      VALUES (e.company_id, e.vessel_id, e.module_key, e.kind_key, e.id, e.entity_id, e.reference, 'signature.status_stepped_back', 'vessel', v_uid,
              e.status, v_new_status, e.current_cycle, jsonb_build_object('signature_id', sg.id));
    END IF;
  END IF;
  PERFORM set_config('storm.record_engine', v_prev_flag, true);

  SELECT * INTO e FROM public.record_envelopes WHERE id = e.id;
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('signature_id', sg.id, 'envelope', to_jsonb(e)));
END;
$$;

-- reSignSlot(): idempotent replay, id conflict, impersonation, the slot's
-- live signature (not_signed), not stale (not_stale), witnessed ones need a
-- new ceremony (needs_ceremony), only the same signer (different_signer),
-- still eligible (not_eligible). The old row is superseded and a new one
-- signed with the current digest; then the vessel_sign transition for a
-- vessel slot.
CREATE OR REPLACE FUNCTION public.record_resign_slot(p_signature_id uuid, p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_flag text := coalesce(current_setting('storm.record_engine', true), '');
  sl public.record_signature_slots;
  e public.record_envelopes;
  live public.record_signatures;
  v_existing public.record_signatures;
  v_caller uuid;
  v_digest text;
  v_signed_at timestamptz := clock_timestamp();
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO sl FROM public.record_signature_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'slot_not_found';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = sl.envelope_id FOR UPDATE;
  IF NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF p_signature_id IS NULL THEN
    RETURN public.record_refusal('invalid_input', 'The signature id is missing.');
  END IF;
  SELECT * INTO v_existing FROM public.record_signatures WHERE id = p_signature_id;
  IF FOUND THEN
    IF v_existing.slot_id = sl.id AND v_existing.cycle = e.current_cycle AND v_existing.removed_at IS NULL AND v_existing.superseded_at IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('signature_id', v_existing.id, 'envelope', to_jsonb(e)));
    END IF;
    RETURN public.record_refusal('invalid_input', 'That signature id is already used on this record.');
  END IF;
  IF public.record_impersonating() THEN
    RETURN public.record_refusal('impersonating', 'Signatures cannot be made while acting as another user.');
  END IF;
  SELECT * INTO live FROM public.record_signatures AS s
  WHERE s.slot_id = sl.id AND s.removed_at IS NULL AND s.superseded_at IS NULL AND s.cycle = e.current_cycle;
  IF NOT FOUND THEN
    RETURN public.record_refusal('not_signed', format('The %s slot is not signed.', sl.label));
  END IF;
  IF e.status IN ('closed', 'void') THEN
    RETURN public.record_refusal('not_open', 'This record is not open for signatures.');
  END IF;
  v_digest := public.record_digest_of(e.section_digests, sl.covers_sections);
  IF live.record_digest = v_digest THEN
    RETURN public.record_refusal('not_stale', 'This signature already covers the current content.');
  END IF;
  IF live.method = 'witnessed' THEN
    RETURN public.record_refusal('needs_ceremony', 'A witnessed signature is re-signed through a new witnessed ceremony.');
  END IF;
  SELECT id INTO v_caller FROM public.profiles WHERE user_id = v_uid;
  IF live.signer_profile_id IS DISTINCT FROM v_caller OR v_caller IS NULL THEN
    RETURN public.record_refusal('different_signer', 'Only the person who signed can re-sign.');
  END IF;
  IF live.method = 'verified' AND NOT public.record_slot_eligible(sl.id, v_caller) THEN
    RETURN public.record_refusal('not_eligible', format('You can no longer sign as %s on this record.', sl.label));
  END IF;

  PERFORM set_config('storm.record_engine', 'on', true);
  UPDATE public.record_signatures SET superseded_at = now() WHERE id = live.id;
  INSERT INTO public.record_signatures (
    id, envelope_id, slot_id, company_id, vessel_id, cycle, slot_key, party, signer_user_id, signer_profile_id, signer_name,
    signer_kind, visitor_company, visitor_capacity, method, witness_profile_id, witness_user_id, on_behalf_of_office, on_behalf_reason,
    decision, image_path, image_sha256, record_digest, record_version, integrity_hash, signed_at
  ) VALUES (
    p_signature_id, live.envelope_id, live.slot_id, live.company_id, live.vessel_id, live.cycle, live.slot_key, live.party, live.signer_user_id,
    live.signer_profile_id, live.signer_name, live.signer_kind, live.visitor_company, live.visitor_capacity, live.method, live.witness_profile_id,
    live.witness_user_id, live.on_behalf_of_office, live.on_behalf_reason, live.decision, live.image_path, live.image_sha256,
    v_digest, e.version, public.record_signature_hash(v_digest, live.slot_id, live.signer_profile_id, live.signer_name, v_signed_at, live.image_sha256), v_signed_at
  );
  PERFORM public.record_log_event(e.id, 'signature.resigned', sl.party,
    jsonb_build_object('signature_id', p_signature_id, 'replaces', live.id, 'slot_id', sl.id, 'slot_key', sl.slot_key));
  IF sl.party = 'vessel' THEN
    PERFORM public.record_vessel_completion(e.id);
  END IF;
  PERFORM set_config('storm.record_engine', v_prev_flag, true);

  SELECT * INTO e FROM public.record_envelopes WHERE id = e.id;
  RETURN jsonb_build_object('ok', true, 'value', jsonb_build_object('signature_id', p_signature_id, 'envelope', to_jsonb(e)));
END;
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.record_refusal(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_signature_hash(text, uuid, uuid, text, timestamptz, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_normalise_office(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_signatures_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_slot_state(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_is_master(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_slot_eligible(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_instantiate_slots(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_vessel_completion(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_sign_slot(uuid, uuid, text, uuid, jsonb, text, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_pass_slot(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_cancel_pass(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_remove_signature(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_resign_slot(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_refusal(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_signature_hash(text, uuid, uuid, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_normalise_office(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_slot_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_is_master(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_slot_eligible(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_instantiate_slots(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_vessel_completion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_sign_slot(uuid, uuid, text, uuid, jsonb, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_pass_slot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_cancel_pass(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_remove_signature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_resign_slot(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.record_signature_slots IS 'Signature slots per envelope and review cycle (gap/08 §B), instantiated from the kind''s slot template. State is derived (record_signature_slot_states), never stored; the pass request lives here. Read: record_readable. No client writes.';
COMMENT ON TABLE public.record_signatures IS 'Signatures (gap/08 SIG3-SIG17): append-only except removed_* / superseded_at set once by the engine (trg_record_signatures_guard); slot-less rows are company decisions. integrity_hash per SIG16. No updated_at (rule 3 exception). Read: record_readable. No client writes.';
COMMENT ON VIEW public.record_signature_slot_states IS 'Every slot with its derived state (slotState(): signed / waiting / requested / open), live signature and stale flag. security_invoker: the reader''s RLS applies.';
COMMENT ON FUNCTION public.record_refusal(text, text) IS 'A business refusal result envelope {ok:false, error:{code, message}}.';
COMMENT ON FUNCTION public.record_signature_hash(text, uuid, uuid, text, timestamptz, text) IS 'SIG16 integrity hash of a signature (sha256 hex). Internal.';
COMMENT ON FUNCTION public.record_normalise_office(text) IS 'An office, position or rank as a snake_case key (ASCII lower case).';
COMMENT ON FUNCTION public.record_signatures_guard() IS 'Trigger: signatures are never deleted; only removed_* / superseded_at change, once, inside the engine.';
COMMENT ON FUNCTION public.record_slot_state(uuid) IS 'Internal: a slot''s derived state (as the view).';
COMMENT ON FUNCTION public.record_is_master(uuid, uuid) IS 'Internal: the user is the Master of the vessel (current assignment, position or rank master / captain).';
COMMENT ON FUNCTION public.record_slot_eligible(uuid, uuid) IS 'Interim slot eligibility (D-132): same company and active; named slots admit the named; company slots company actors; vessel slots reach or the office on this vessel.';
COMMENT ON FUNCTION public.record_instantiate_slots(uuid, integer) IS 'Internal: the kind template''s slots for one cycle of an envelope.';
COMMENT ON FUNCTION public.record_vessel_completion(uuid) IS 'Internal: the vessel_sign transition after a vessel signature.';
COMMENT ON FUNCTION public.record_sign_slot(uuid, uuid, text, uuid, jsonb, text, text, text, integer) IS 'Sign a slot (signSlot() / signBlocker(), same codes); on-behalf is refused (D-48). Returns a result envelope.';
COMMENT ON FUNCTION public.record_pass_slot(uuid, uuid) IS 'Pass an open slot to an eligible person (passSlotTo()).';
COMMENT ON FUNCTION public.record_cancel_pass(uuid) IS 'Cancel a pass (cancelPass()).';
COMMENT ON FUNCTION public.record_remove_signature(uuid, text) IS 'Remove a signature (removeBlocker() / removeSignature(): reverse order, who may, D-51 lock, reason once submitted).';
COMMENT ON FUNCTION public.record_resign_slot(uuid, uuid) IS 'Re-sign a stale signature (reSignSlot()).';
