-- =================================================================
-- PLATFORM P2: record references (gap/01 F21; DECISIONS C21, D-25;
-- Phase 2 spec §A.6; proposed D-126)
-- Tables: none new (the live reference_counters is reused)
-- Helpers: format_reference_text(), format_voyage_reference_text(),
--   reference_counter_scope(), format_reference(), format_voyage_reference()
-- TS mirror: src/lib/records/reference.ts (formatReference,
--   formatVoyageReference, referenceCounterScope; frozen in Phase 2)
-- Parity: supabase/tests/fixtures/reference-cases.json (generated from the
--   TS by scripts/db/gen-reference-fixture.mjs), asserted by
--   supabase/tests/sql/p2_reference
-- =================================================================
--
--   vessel records   TYPE-VSL-YYYY-NNN    PTW-DRA-2026-061
--   fleet records    TYPE-YYYY-NNN        AUD-2026-004
--   voyages          VSL-YYYYMMDD-NNN     DRA-20261103-037
--
-- TYPE is a letter then up to seven letters or digits, VSL the vessel code
-- (D-25), NNN the counter, zero-padded to three digits and growing past
-- 999. Counters come from the live, race-safe next_reference_value()
-- (one-statement upsert on reference_counters) under the scopes of
-- referenceCounterScope(): ref:<TYPE>:<company>:<vessel id | fleet>:<YYYY>
-- and voyage:<company>:<vessel id>:<YYYYMMDD>. Counters are keyed by the
-- vessel id, so a code fix-up never collides; once a vessel has a counter
-- its code is locked (trg_vessels_set_code, file 1).
--
-- format_reference() / format_voyage_reference() are service role only:
-- the record engine's definers (record_open_envelope) and domain triggers
-- call them; the browser never numbers anything.
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.next_reference_value(text)') IS NULL OR to_regclass('public.reference_counters') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000600_platform_format_reference needs reference_counters and next_reference_value(text): apply 20260919220000_reference_numbers.sql first';
  END IF;
  IF to_regprocedure('public.vessel_code_stored(text)') IS NULL OR to_regprocedure('public.normalise_code_text(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000600_platform_format_reference needs vessel_code_stored() and normalise_code_text(): apply 20261123000100_platform_vessel_tenancy.sql first';
  END IF;
  IF to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_company_actor(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000600_platform_format_reference needs the reach and capability helpers: apply 20261123000300 and 20261123000400 first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- pure formatters (TS mirrors)

-- formatReference(): the type trimmed and upper-cased as JS does, a letter
-- then up to seven letters or digits; a NULL or blank vessel code gives the
-- fleet form, any other must be a vessel code; the counter 1 or more.
-- Invalid input raises 22023 (the TS RangeError).
CREATE OR REPLACE FUNCTION public.format_reference_text(p_type text, p_vessel_code text, p_on date, p_seq integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  v_type text := public.normalise_code_text(p_type);
  v_code text;
  v_seq text;
BEGIN
  IF v_type IS NULL OR v_type !~ '^[A-Z][A-Z0-9]{0,7}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_type_invalid',
      DETAIL = 'A reference type is 1 to 8 letters or digits starting with a letter.';
  END IF;
  IF p_on IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_date_invalid';
  END IF;
  IF p_seq IS NULL OR p_seq < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_counter_invalid',
      DETAIL = 'A reference counter is a whole number of 1 or more.';
  END IF;
  v_seq := CASE WHEN length(p_seq::text) < 3 THEN lpad(p_seq::text, 3, '0') ELSE p_seq::text END;
  IF p_vessel_code IS NULL OR public.normalise_code_text(p_vessel_code) = '' THEN
    RETURN v_type || '-' || to_char(p_on, 'YYYY') || '-' || v_seq;
  END IF;
  v_code := public.vessel_code_stored(p_vessel_code);
  IF v_code IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_vessel_code_invalid',
      DETAIL = 'A vessel code is a letter followed by two letters or digits.';
  END IF;
  RETURN v_type || '-' || v_code || '-' || to_char(p_on, 'YYYY') || '-' || v_seq;
END;
$$;

-- formatVoyageReference(): VSL-YYYYMMDD-NNN; the vessel code is required.
CREATE OR REPLACE FUNCTION public.format_voyage_reference_text(p_vessel_code text, p_on date, p_seq integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  v_code text := public.vessel_code_stored(p_vessel_code);
BEGIN
  IF p_vessel_code IS NULL OR v_code IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_vessel_code_invalid',
      DETAIL = 'A vessel code is a letter followed by two letters or digits.';
  END IF;
  IF p_on IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_date_invalid';
  END IF;
  IF p_seq IS NULL OR p_seq < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_counter_invalid',
      DETAIL = 'A reference counter is a whole number of 1 or more.';
  END IF;
  RETURN v_code || '-' || to_char(p_on, 'YYYYMMDD') || '-'
      || CASE WHEN length(p_seq::text) < 3 THEN lpad(p_seq::text, 3, '0') ELSE p_seq::text END;
END;
$$;

-- referenceCounterScope(): ref:<TYPE>:<company>:<vessel id | fleet>:<YYYY>,
-- or voyage:<company>:<vessel id>:<YYYYMMDD> (the type is not used for a
-- voyage, as in the TS). A voyage without a vessel raises 22023.
CREATE OR REPLACE FUNCTION public.reference_counter_scope(p_type text, p_company_id uuid, p_vessel_id uuid, p_on date, p_voyage boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  IF p_on IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_date_invalid';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_company_required';
  END IF;
  IF coalesce(p_voyage, false) THEN
    IF p_vessel_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_voyage_needs_vessel',
        DETAIL = 'Voyage counters need a vessel.';
    END IF;
    RETURN 'voyage:' || p_company_id::text || ':' || p_vessel_id::text || ':' || to_char(p_on, 'YYYYMMDD');
  END IF;
  v_type := public.normalise_code_text(p_type);
  IF v_type IS NULL OR v_type !~ '^[A-Z][A-Z0-9]{0,7}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_type_invalid',
      DETAIL = 'A reference type is 1 to 8 letters or digits starting with a letter.';
  END IF;
  RETURN 'ref:' || v_type || ':' || p_company_id::text || ':' || coalesce(p_vessel_id::text, 'fleet') || ':' || to_char(p_on, 'YYYY');
END;
$$;

-- ---------------------------------------------------------------- allocation (service role; definers call it)

-- Allocates the next reference of a kind for a vessel (or the fleet) of a
-- company. Validates the type and date first (nothing is allocated for
-- invalid input, 22023), then the ids: the company exists and the vessel
-- (when given) is one of its vessels (else 42501). When a user is calling
-- (auth.uid() set: a definer acting for them), the user must be active, in
-- the company, and reach the vessel, or, for a fleet record, have fleet
-- reach or act as the company (else 42501).
CREATE OR REPLACE FUNCTION public.format_reference(p_type text, p_company_id uuid, p_vessel_id uuid DEFAULT NULL, p_on date DEFAULT current_date)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text := public.normalise_code_text(p_type);
  v_code text;
  v_seq integer;
BEGIN
  IF v_type IS NULL OR v_type !~ '^[A-Z][A-Z0-9]{0,7}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_type_invalid',
      DETAIL = 'A reference type is 1 to 8 letters or digits starting with a letter.';
  END IF;
  IF p_on IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_date_invalid';
  END IF;
  IF p_company_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.companies AS c WHERE c.id = p_company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'reference_scope_denied';
  END IF;
  IF p_vessel_id IS NOT NULL THEN
    SELECT v.code INTO v_code FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = p_company_id;
    IF v_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'reference_scope_denied';
    END IF;
  END IF;
  IF v_uid IS NOT NULL THEN
    IF NOT public.user_is_active(v_uid)
       OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = v_uid AND p.company_id = p_company_id)
       OR (p_vessel_id IS NOT NULL AND NOT public.reach_vessel_for(v_uid, p_vessel_id))
       OR (p_vessel_id IS NULL AND NOT (public.fleet_reach_for(v_uid, p_company_id) OR public.is_company_actor(v_uid, NULL))) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'reference_scope_denied';
    END IF;
  END IF;
  v_seq := public.next_reference_value(public.reference_counter_scope(v_type, p_company_id, p_vessel_id, p_on, false));
  RETURN public.format_reference_text(v_type, v_code, p_on, v_seq);
END;
$$;

-- The next voyage reference of a vessel for a day; same checks (a vessel
-- is required).
CREATE OR REPLACE FUNCTION public.format_voyage_reference(p_company_id uuid, p_vessel_id uuid, p_on date DEFAULT current_date)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_seq integer;
BEGIN
  IF p_vessel_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_voyage_needs_vessel',
      DETAIL = 'Voyage counters need a vessel.';
  END IF;
  IF p_on IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference_date_invalid';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'reference_scope_denied';
  END IF;
  SELECT v.code INTO v_code FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = p_company_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'reference_scope_denied';
  END IF;
  IF v_uid IS NOT NULL THEN
    IF NOT public.user_is_active(v_uid)
       OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = v_uid AND p.company_id = p_company_id)
       OR NOT public.reach_vessel_for(v_uid, p_vessel_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'reference_scope_denied';
    END IF;
  END IF;
  v_seq := public.next_reference_value(public.reference_counter_scope(NULL, p_company_id, p_vessel_id, p_on, true));
  RETURN public.format_voyage_reference_text(v_code, p_on, v_seq);
END;
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.format_reference_text(text, text, date, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.format_voyage_reference_text(text, date, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reference_counter_scope(text, uuid, uuid, date, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.format_reference(text, uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.format_voyage_reference(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.format_reference_text(text, text, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.format_voyage_reference_text(text, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reference_counter_scope(text, uuid, uuid, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.format_reference(text, uuid, uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.format_voyage_reference(uuid, uuid, date) TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.format_reference_text(text, text, date, integer) IS 'Mirror of formatReference() (src/lib/records/reference.ts): TYPE-VSL-YYYY-NNN, or TYPE-YYYY-NNN without a vessel code; invalid input raises 22023. Parity: reference-cases.json.';
COMMENT ON FUNCTION public.format_voyage_reference_text(text, date, integer) IS 'Mirror of formatVoyageReference(): VSL-YYYYMMDD-NNN; invalid input raises 22023.';
COMMENT ON FUNCTION public.reference_counter_scope(text, uuid, uuid, date, boolean) IS 'Mirror of referenceCounterScope(): the reference_counters scope (ref:TYPE:company:vessel|fleet:YYYY or voyage:company:vessel:YYYYMMDD). Service role only.';
COMMENT ON FUNCTION public.format_reference(text, uuid, uuid, date) IS 'Allocates the next record reference with next_reference_value() and formats it (D-126). Service role only: definers and domain triggers call it; a calling user must be active, of the company and reach the vessel (fleet records: fleet reach or company actor).';
COMMENT ON FUNCTION public.format_voyage_reference(uuid, uuid, date) IS 'Allocates the next voyage reference of a vessel for a day and formats it. Service role only; same checks as format_reference.';
