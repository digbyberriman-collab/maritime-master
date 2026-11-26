-- =================================================================
-- PLATFORM P1: vessel tenancy columns and the vessel code (gap/01 F9, F10,
-- C2, C20; DECISIONS D-03, D-25; Phase 2 spec §A.1)
-- Tables: public.vessels (new columns code, short_code, lifecycle_status,
--   is_counted, vessel_purpose, archived_at, archived_by, archive_reason)
-- Helpers: normalise_code_text(), vessel_code_letters(),
--   vessel_code_candidates(), vessel_code_stored(), vessel_codes_assign(),
--   vessel_codes_for_company(); triggers trg_vessels_set_code,
--   trg_vessels_sync_lifecycle
-- TS mirror: src/modules/vessels/lib/vesselCode.ts (derivation, frozen in
--   Phase 2) and src/modules/vessels/types/db.pending.ts
--   (VesselsPendingColumns.vessels)
-- Parity: supabase/tests/fixtures/vessel-code-corpus.json (generated from
--   the TS by scripts/db/gen-vessel-code-corpus.mjs), asserted by
--   supabase/tests/sql/p1_vessel_tenancy/*.test.sql
-- =================================================================
--
-- Every vessel gets the three-character code people already see in links
-- (`/v/dra/…`) and will see in record references (`PTW-DRA-2026-061`). The
-- backfill uses the exact client derivation (assignVesselCodes over the
-- whole company fleet, sold vessels included), so no code a user has seen
-- changes. New vessels without a code get the first free candidate of their
-- name under a per-company advisory lock. A code is locked once a reference
-- has been numbered with it (gap/01 F9: an admin may fix a code before the
-- first numbered record, never after).
--
-- The legacy `status` text and the new `lifecycle_status` are kept in step
-- while legacy writers exist (Sold ⇔ archived).
--
-- RLS on vessels is not changed here: that is
-- 20261123010100_platform_access_rls.sql, after P1 (D-25).
--
-- Idempotent (D-12): a second run changes nothing.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.vessels') IS NULL OR to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000100_platform_vessel_tenancy needs public.vessels and public.companies: apply the legacy migrations first';
  END IF;
  IF to_regclass('public.reference_counters') IS NULL OR to_regprocedure('public.next_reference_value(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000100_platform_vessel_tenancy needs public.reference_counters and next_reference_value(text): apply 20260919220000_reference_numbers.sql first';
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000100_platform_vessel_tenancy needs public.update_updated_at_column() and auth.users';
  END IF;
END
$$;

-- ---------------------------------------------------------------- columns

ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS short_code text;
ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS is_counted boolean NOT NULL DEFAULT true;
ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS vessel_purpose text NOT NULL DEFAULT 'operational';
ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS archived_by uuid;
ALTER TABLE public.vessels ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE public.vessels
  DROP CONSTRAINT IF EXISTS vessels_code_format,
  ADD CONSTRAINT vessels_code_format CHECK (code ~ '^[A-Z][A-Z0-9]{2}$');
ALTER TABLE public.vessels
  DROP CONSTRAINT IF EXISTS vessels_short_code_format,
  ADD CONSTRAINT vessels_short_code_format CHECK (short_code IS NULL OR short_code ~ '^[A-Z][A-Z0-9]$');
ALTER TABLE public.vessels
  DROP CONSTRAINT IF EXISTS vessels_lifecycle_status_check,
  ADD CONSTRAINT vessels_lifecycle_status_check CHECK (lifecycle_status IN ('active', 'inactive', 'archived'));
ALTER TABLE public.vessels
  DROP CONSTRAINT IF EXISTS vessels_vessel_purpose_check,
  ADD CONSTRAINT vessels_vessel_purpose_check CHECK (vessel_purpose IN ('operational', 'demo', 'training'));
ALTER TABLE public.vessels
  DROP CONSTRAINT IF EXISTS vessels_archive_reason_length,
  ADD CONSTRAINT vessels_archive_reason_length CHECK (archive_reason IS NULL OR length(archive_reason) <= 500);
ALTER TABLE public.vessels
  DROP CONSTRAINT IF EXISTS vessels_archived_by_fkey,
  ADD CONSTRAINT vessels_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vessels_company_short_code_key ON public.vessels (company_id, short_code) WHERE short_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vessels_company_lifecycle ON public.vessels (company_id, lifecycle_status);

-- ---------------------------------------------------------------- pure helpers (TS mirrors)

-- JS `String(text).trim().toUpperCase()` for code-like text: trims the JS
-- whitespace set (`trim()` / `\s`: TAB LF VT FF CR SPACE U+00A0 U+1680
-- U+2000–U+200A U+2028 U+2029 U+202F U+205F U+3000 U+FEFF; Postgres
-- `btrim()` alone trims only spaces), upper-cases a–z with translate()
-- (never upper(): its result depends on the database locale) and applies
-- the JS expansions whose result is ASCII (ß→SS, ı→I, ſ→S, ﬀ→FF, ﬁ→FI,
-- ﬂ→FL, ﬃ→FFI, ﬄ→FFL, ﬅ→ST, ﬆ→ST; the `storedUpper` table of the corpus).
-- Any other character is kept as it is, so a pattern test of the result
-- answers as JS does: every result that is pure [A-Z0-9] equals JS's.
CREATE OR REPLACE FUNCTION public.normalise_code_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    replace(replace(replace(replace(replace(replace(replace(replace(
      translate(
        btrim(p_text, E'\t\n\u000b\f\r                  　﻿'),
        'abcdefghijklmnopqrstuvwxyz' || E'ıſ',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || 'IS'
      ),
      E'ß', 'SS'), E'ﬀ', 'FF'), E'ﬁ', 'FI'), E'ﬂ', 'FL'),
      E'ﬃ', 'FFI'), E'ﬄ', 'FFL'), E'ﬅ', 'ST'), E'ﬆ', 'ST')
$$;

-- vesselCodeLetters(): strip one leading M/Y, S/Y, R/V, MY, SY or RV
-- followed by at least one separator (JS `\s` or . , : ; -), NFD, drop
-- U+0300–U+036F, JS upper-case (ASCII translate plus the special table:
-- ß→SS, ı→I, ŉ→N, ſ→S, ẚ→A, ﬀ→FF, ﬁ→FI, ﬂ→FL, ﬃ→FFI, ﬄ→FFL, ﬅ→ST,
-- ﬆ→ST), keep A–Z; no letters → 'VSL'. The prefix letters are matched
-- case-insensitively for ASCII only, as the JS /i flag without /u does.
CREATE OR REPLACE FUNCTION public.vessel_code_letters(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(nullif(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        translate(
          regexp_replace(
            normalize(
              regexp_replace(
                coalesce(p_name, ''),
                E'^[\t\n\u000b\f\r                  　﻿]*'
                  || '([Mm]/[Yy]|[Ss]/[Yy]|[Rr]/[Vv]|[Mm][Yy]|[Ss][Yy]|[Rr][Vv])'
                  || E'[\t\n\u000b\f\r                  　﻿.,:;-]+',
                ''
              ),
              NFD
            ),
            E'[̀-ͯ]', '', 'g'
          ),
          'abcdefghijklmnopqrstuvwxyz' || E'ıſŉẚ',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || 'ISNA'
        ),
        E'ß', 'SS'), E'ﬀ', 'FF'), E'ﬁ', 'FI'), E'ﬂ', 'FL'),
        E'ﬃ', 'FFI'), E'ﬄ', 'FFL'), E'ﬅ', 'ST'), E'ﬆ', 'ST'),
      '[^ABCDEFGHIJKLMNOPQRSTUVWXYZ]', '', 'g'
    ),
    ''), 'VSL')
$$;

-- candidateCodes(): the plain code (letters padded with X to three), the
-- first letter plus the next two consonants (Y counts as a vowel; only
-- with two consonants after the first letter), the first two characters
-- plus 1–9 then 0, then the first letter plus two of A–Z0–9 in that order;
-- no repeats. Stops once `p_limit` codes are listed, checked after each
-- one as the TS does (so a limit below 1 still returns the plain code).
CREATE OR REPLACE FUNCTION public.vessel_code_candidates(p_name text, p_limit integer DEFAULT 12)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  c_alnum constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  c_digits constant text := '1234567890';
  v_letters text := public.vessel_code_letters(p_name);
  v_padded text;
  v_first text;
  v_limit integer := coalesce(p_limit, 0);
  v_head text[] := ARRAY[]::text[];
  v_out text[];
  v_cons text[] := ARRAY[]::text[];
  v_code text;
  v_ch text;
  i integer;
  j integer;
BEGIN
  v_padded := CASE WHEN length(v_letters) < 3 THEN rpad(v_letters, 3, 'X') ELSE v_letters END;
  v_first := substr(v_padded, 1, 1);

  -- 1. plain
  v_head := v_head || substr(v_padded, 1, 3);
  IF cardinality(v_head) >= v_limit THEN RETURN v_head; END IF;

  -- 2. first letter + the next two consonants (Y is a vowel here)
  FOR i IN 2..length(v_letters) LOOP
    v_ch := substr(v_letters, i, 1);
    IF position(v_ch IN 'AEIOUY') = 0 THEN
      v_cons := v_cons || v_ch;
      EXIT WHEN cardinality(v_cons) >= 2;
    END IF;
  END LOOP;
  IF cardinality(v_cons) >= 2 THEN
    v_code := v_first || v_cons[1] || v_cons[2];
    IF NOT (v_code = ANY (v_head)) THEN
      v_head := v_head || v_code;
      IF cardinality(v_head) >= v_limit THEN RETURN v_head; END IF;
    END IF;
  END IF;

  -- 3. first two + a digit, 1–9 then 0
  FOR i IN 1..10 LOOP
    v_code := substr(v_padded, 1, 2) || substr(c_digits, i, 1);
    IF NOT (v_code = ANY (v_head)) THEN
      v_head := v_head || v_code;
      IF cardinality(v_head) >= v_limit THEN RETURN v_head; END IF;
    END IF;
  END LOOP;

  -- 4. last resort: first + two of A–Z0–9. These are distinct from each
  -- other, so only the codes above can repeat one of them.
  v_out := v_head;
  FOR i IN 1..36 LOOP
    FOR j IN 1..36 LOOP
      v_code := v_first || substr(c_alnum, i, 1) || substr(c_alnum, j, 1);
      IF NOT (v_code = ANY (v_head)) THEN
        v_out := v_out || v_code;
        IF cardinality(v_out) >= v_limit THEN RETURN v_out; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_out;
END;
$$;

-- storedVesselCode(): the stored code trimmed and upper-cased as JS does,
-- when it is a usable code (a letter, then two letters or digits); else NULL.
CREATE OR REPLACE FUNCTION public.vessel_code_stored(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE WHEN n ~ '^[A-Z][A-Z0-9]{2}$' THEN n END
  FROM (SELECT public.normalise_code_text(coalesce(p_code, '')) AS n) AS s
$$;

-- assignVesselCodes() over a fleet given as a jsonb array of
-- {id, name, created_at, code} (the TS VesselCodeSource): the first row of
-- each id counts; rows sort by created_at truncated to milliseconds (JS
-- Date.parse keeps milliseconds only; a missing date sorts last), then by
-- id; valid stored codes are reserved first in that order (a clashing
-- later one is dropped), then every other vessel takes its first free
-- candidate. created_at must be an ISO-8601 timestamp or null. STABLE, not
-- IMMUTABLE: a timestamp without an offset is read in the session time zone.
-- More than 2000 elements: 22023 vessel_codes_too_many. Service role and
-- definers only (D-231).
CREATE OR REPLACE FUNCTION public.vessel_codes_assign(p_vessels jsonb)
RETURNS TABLE (vessel_id uuid, code text)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_names text[];
  v_codes text[];
  v_assigned text[];
  v_taken text[] := ARRAY[]::text[];
  v_stored text;
  v_code text;
  v_n integer;
  i integer;
BEGIN
  -- A bounded input (review round 5, D-231): the derivation is quadratic
  -- in the fleet size, and no fleet comes near 2000 vessels.
  IF jsonb_typeof(p_vessels) = 'array' AND jsonb_array_length(p_vessels) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_codes_too_many',
      DETAIL = 'At most 2000 vessels can be coded in one call.';
  END IF;
  WITH input AS (
    SELECT (e ->> 'id')::uuid AS id,
           e ->> 'name' AS name,
           e ->> 'code' AS code,
           CASE WHEN nullif(e ->> 'created_at', '') IS NOT NULL
                THEN date_trunc('milliseconds', (e ->> 'created_at')::timestamptz) END AS at,
           ord
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_vessels) = 'array' THEN p_vessels ELSE '[]'::jsonb END)
         WITH ORDINALITY AS t(e, ord)
    WHERE jsonb_typeof(e) = 'object' AND nullif(e ->> 'id', '') IS NOT NULL
  ), firsts AS (
    SELECT DISTINCT ON (input.id) input.id, input.name, input.code, input.at
    FROM input
    ORDER BY input.id, input.ord
  )
  SELECT array_agg(f.id ORDER BY f.at ASC NULLS LAST, f.id),
         array_agg(f.name ORDER BY f.at ASC NULLS LAST, f.id),
         array_agg(f.code ORDER BY f.at ASC NULLS LAST, f.id)
  INTO v_ids, v_names, v_codes
  FROM firsts AS f;

  v_n := coalesce(cardinality(v_ids), 0);
  IF v_n = 0 THEN RETURN; END IF;
  v_assigned := array_fill(NULL::text, ARRAY[v_n]);

  FOR i IN 1..v_n LOOP
    v_stored := public.vessel_code_stored(v_codes[i]);
    IF v_stored IS NOT NULL AND NOT (v_stored = ANY (v_taken)) THEN
      v_taken := v_taken || v_stored;
      v_assigned[i] := v_stored;
    END IF;
  END LOOP;

  FOR i IN 1..v_n LOOP
    CONTINUE WHEN v_assigned[i] IS NOT NULL;
    SELECT c INTO v_code
    FROM unnest(public.vessel_code_candidates(v_names[i], 12)) WITH ORDINALITY AS u(c, o)
    WHERE NOT (c = ANY (v_taken))
    ORDER BY o
    LIMIT 1;
    IF v_code IS NULL THEN
      SELECT c INTO v_code
      FROM unnest(public.vessel_code_candidates(v_names[i], 2000)) WITH ORDINALITY AS u(c, o)
      WHERE NOT (c = ANY (v_taken))
      ORDER BY o
      LIMIT 1;
    END IF;
    IF v_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'vessel_code_exhausted',
        DETAIL = 'Every code this vessel name allows is taken in the fleet.';
    END IF;
    v_taken := v_taken || v_code;
    v_assigned[i] := v_code;
  END LOOP;

  RETURN QUERY SELECT v_ids[k], v_assigned[k] FROM generate_subscripts(v_ids, 1) AS k;
END;
$$;

-- The code of every vessel of a company, exactly as the client derives it
-- (every vessel, sold ones included, so the answer does not depend on what
-- a user can reach). Used by the backfill and the tests.
CREATE OR REPLACE FUNCTION public.vessel_codes_for_company(p_company_id uuid)
RETURNS TABLE (vessel_id uuid, code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.vessel_id, a.code
  FROM public.vessel_codes_assign((
    SELECT coalesce(
      jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'created_at', v.created_at, 'code', v.code) ORDER BY v.created_at, v.id),
      '[]'::jsonb)
    FROM public.vessels AS v
    WHERE v.company_id = p_company_id
  )) AS a
$$;

-- ---------------------------------------------------------------- triggers

-- BEFORE INSERT OR UPDATE OF code. A given code is normalised (trim +
-- upper case as JS does) and must be a usable code. Without a code (an
-- insert without one, or an update that clears it), the vessel takes the
-- first candidate of its name that no other vessel of the company holds,
-- under a per-company advisory lock (two inserts cannot pick the same
-- code; the unique index is the backstop). A code that was set is locked
-- once a reference counter names the vessel (or, once the record engine
-- exists, a record envelope belongs to it); writing the same code again is
-- not a change.
CREATE OR REPLACE FUNCTION public.vessels_set_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_locked boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.code IS NOT DISTINCT FROM OLD.code THEN
    RETURN NEW;
  END IF;

  IF NEW.code IS NOT NULL THEN
    v_code := public.vessel_code_stored(NEW.code);
    IF v_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'vessel_code_invalid',
        DETAIL = 'A vessel code is a letter followed by two letters or digits, for example DRA or DR1.';
    END IF;
    IF TG_OP = 'UPDATE' AND v_code = OLD.code THEN
      NEW.code := v_code;
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.code IS NOT NULL THEN
    v_locked := EXISTS (SELECT 1 FROM public.reference_counters AS rc WHERE position(OLD.id::text IN rc.scope) > 0);
    IF NOT v_locked AND to_regclass('public.record_envelopes') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.record_envelopes WHERE vessel_id = $1)' INTO v_locked USING OLD.id;
    END IF;
    IF v_locked THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'vessel_code_locked',
        DETAIL = 'Records are already numbered with this vessel code, so it can no longer change.';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('vessel_code:' || NEW.company_id::text, 0));

  IF v_code IS NULL THEN
    SELECT u.c INTO v_code
    FROM unnest(public.vessel_code_candidates(NEW.name, 12)) WITH ORDINALITY AS u(c, o)
    WHERE NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.company_id = NEW.company_id AND v.id <> NEW.id AND v.code = u.c)
    ORDER BY u.o
    LIMIT 1;
    IF v_code IS NULL THEN
      SELECT u.c INTO v_code
      FROM unnest(public.vessel_code_candidates(NEW.name, 2000)) WITH ORDINALITY AS u(c, o)
      WHERE NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.company_id = NEW.company_id AND v.id <> NEW.id AND v.code = u.c)
      ORDER BY u.o
      LIMIT 1;
    END IF;
    IF v_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'vessel_code_exhausted',
        DETAIL = 'Every code this vessel name allows is taken in the fleet.';
    END IF;
  END IF;

  NEW.code := v_code;
  RETURN NEW;
END;
$$;

-- BEFORE INSERT OR UPDATE OF status, lifecycle_status, archived_at,
-- archived_by: Sold ⇔ archived.
-- status set to 'Sold' → archived; status moved away from 'Sold' while
-- archived → active; lifecycle set to archived → status 'Sold'; lifecycle
-- moved away from archived → status 'Active' when it was 'Sold'.
-- The archive stamp is the server's (D-230; review round 5,
-- actor-columns-client-forgeable): a row that becomes archived under a
-- JWT gets archived_by = the caller and archived_at = now(); without a JWT
-- (the backfill, the service role) a given archived_at is kept, else
-- now(). While it stays archived, a JWT caller cannot rewrite the stamp
-- (the stored values are kept); without a JWT the given values are kept.
-- While it is not archived, archived_at and archived_by are NULL; leaving
-- archived also clears archive_reason. No other column is touched.
CREATE OR REPLACE FUNCTION public.vessels_sync_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_becomes boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'Sold' THEN
      NEW.lifecycle_status := 'archived';
    ELSIF NEW.lifecycle_status = 'archived' THEN
      NEW.status := 'Sold';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'Sold' THEN
        NEW.lifecycle_status := 'archived';
      ELSIF OLD.status = 'Sold' AND NEW.lifecycle_status = 'archived' THEN
        NEW.lifecycle_status := 'active';
      END IF;
    END IF;
    IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
      IF NEW.lifecycle_status = 'archived' AND NEW.status IS DISTINCT FROM 'Sold' THEN
        NEW.status := 'Sold';
      ELSIF OLD.lifecycle_status = 'archived' AND NEW.status = 'Sold' THEN
        NEW.status := 'Active';
      END IF;
    END IF;
  END IF;

  IF NEW.lifecycle_status = 'archived' THEN
    v_becomes := TG_OP = 'INSERT' OR OLD.lifecycle_status IS DISTINCT FROM 'archived';
    IF v_becomes AND v_uid IS NOT NULL THEN
      NEW.archived_by := v_uid;
      NEW.archived_at := now();
    ELSIF v_becomes THEN
      NEW.archived_at := coalesce(NEW.archived_at, now());
    ELSIF v_uid IS NOT NULL THEN
      NEW.archived_by := OLD.archived_by;
      NEW.archived_at := OLD.archived_at;
    ELSE
      NEW.archived_at := coalesce(NEW.archived_at, now());
    END IF;
  ELSE
    NEW.archived_at := NULL;
    NEW.archived_by := NULL;
    IF TG_OP = 'UPDATE' AND OLD.lifecycle_status = 'archived' THEN
      NEW.archive_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- backfill

-- Sold vessels are archived first, so archived_at takes the last update
-- before this file (the best date there is; the code backfill below bumps
-- updated_at through the live update_vessels_updated_at trigger).
-- is_counted and vessel_purpose keep their defaults: the owner reviews
-- organisational pseudo-vessels after the apply (spec §G 2).
UPDATE public.vessels
SET lifecycle_status = 'archived',
    archived_at = coalesce(archived_at, updated_at)
WHERE status = 'Sold'
  AND lifecycle_status <> 'archived';

-- Codes: every company with a vessel still without one, exactly as the
-- client derives them today (only rows still NULL are written: idempotent).
UPDATE public.vessels AS v
SET code = c.code
FROM (
  SELECT a.vessel_id, a.code
  FROM (SELECT DISTINCT company_id FROM public.vessels WHERE code IS NULL) AS co
  CROSS JOIN LATERAL public.vessel_codes_for_company(co.company_id) AS a
) AS c
WHERE v.id = c.vessel_id
  AND v.code IS NULL;

ALTER TABLE public.vessels ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vessels_company_code_key ON public.vessels (company_id, code);

DROP TRIGGER IF EXISTS trg_vessels_set_code ON public.vessels;
CREATE TRIGGER trg_vessels_set_code
  BEFORE INSERT OR UPDATE OF code ON public.vessels
  FOR EACH ROW EXECUTE FUNCTION public.vessels_set_code();

DROP TRIGGER IF EXISTS trg_vessels_sync_lifecycle ON public.vessels;
CREATE TRIGGER trg_vessels_sync_lifecycle
  BEFORE INSERT OR UPDATE OF status, lifecycle_status, archived_at, archived_by ON public.vessels
  FOR EACH ROW EXECUTE FUNCTION public.vessels_sync_lifecycle();

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.normalise_code_text(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_code_letters(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_code_candidates(text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_code_stored(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_codes_assign(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_codes_for_company(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_set_code() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_sync_lifecycle() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.normalise_code_text(text) TO authenticated, service_role;
-- The code derivation helpers are for the service role and definers only
-- (D-231; review round 5, vessel-code-helpers-cpu-grant): no client or
-- edge path calls them (the client has the TS mirror), and a signed-in
-- call of vessel_codes_assign could burn seconds of CPU. vessels_set_code
-- is SECURITY DEFINER, so vessel inserts and code edits keep working.
GRANT EXECUTE ON FUNCTION public.vessel_code_letters(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vessel_code_candidates(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.vessel_code_stored(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vessel_codes_assign(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.vessel_codes_for_company(uuid) TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON COLUMN public.vessels.code IS 'Three-character vessel code (D-03, D-25): a letter then two letters or digits, upper case, unique per company. Derived from the name when not given (trg_vessels_set_code); locked once a reference is numbered with it. URLs use it lower case (/v/dra/...).';
COMMENT ON COLUMN public.vessels.short_code IS 'Optional two-character template code (a letter then a letter or digit), unique per company. No backfill (D-03 covers the three-character code only).';
COMMENT ON COLUMN public.vessels.lifecycle_status IS 'active | inactive | archived (C2; gap/01 W5). Kept in step with the legacy status by trg_vessels_sync_lifecycle: Sold <=> archived.';
COMMENT ON COLUMN public.vessels.is_counted IS 'Counted in fleet KPIs and "n vessels" labels (with lifecycle_status = active). False for organisational pseudo-vessels.';
COMMENT ON COLUMN public.vessels.vessel_purpose IS 'operational | demo | training (C2: replaces is_demo / is_training).';
COMMENT ON COLUMN public.vessels.archived_at IS 'When the vessel was archived: now() when a signed-in caller archives it (trg_vessels_sync_lifecycle, D-230; a later update cannot rewrite it); without a JWT a given value is kept, else now(); NULL while not archived.';
COMMENT ON COLUMN public.vessels.archived_by IS 'Who archived the vessel: the signed-in caller, stamped by trg_vessels_sync_lifecycle (D-230; a later update cannot rewrite it); without a JWT the given value (NULL when unknown); NULL while not archived.';
COMMENT ON COLUMN public.vessels.archive_reason IS 'Why the vessel was archived (500 characters at most).';

COMMENT ON FUNCTION public.normalise_code_text(text) IS 'JS String(text).trim().toUpperCase() for code-like text (JS whitespace set, ASCII a-z, the JS expansions whose result is ASCII). Pure helper of vessel_code_stored() and the reference formatters.';
COMMENT ON FUNCTION public.vessel_code_letters(text) IS 'Mirror of vesselCodeLetters() (src/modules/vessels/lib/vesselCode.ts): prefix stripped, NFD, marks dropped, JS upper case, A-Z only; VSL when empty. Service role and definers only (D-231). Parity: vessel-code-corpus.json.';
COMMENT ON FUNCTION public.vessel_code_candidates(text, integer) IS 'Mirror of vesselCodeCandidates(name, limit): plain, first + two consonants (Y a vowel), first two + 1-9,0, first + [A-Z0-9]{2}; no repeats. Service role and definers only (D-231). Parity: vessel-code-corpus.json.';
COMMENT ON FUNCTION public.vessel_code_stored(text) IS 'Mirror of storedVesselCode(): the code trimmed and upper-cased as JS does when it matches ^[A-Z][A-Z0-9]{2}$, else NULL.';
COMMENT ON FUNCTION public.vessel_codes_assign(jsonb) IS 'Mirror of assignVesselCodes() over a jsonb array of {id, name, created_at, code}: collision order created_at (milliseconds) then id, stored codes reserved first; at most 2000 elements (22023 vessel_codes_too_many). Service role and definers only (D-231). Parity: vessel-code-corpus.json fleets.';
COMMENT ON FUNCTION public.vessel_codes_for_company(uuid) IS 'Every vessel code of a company (sold vessels included) as the client derives it. Service role only: used by the P1 backfill and the tests.';
COMMENT ON FUNCTION public.vessels_set_code() IS 'Trigger trg_vessels_set_code: normalises a given code, derives a free one under a per-company advisory lock when none is given, refuses a change once records are numbered with the vessel (vessel_code_locked).';
COMMENT ON FUNCTION public.vessels_sync_lifecycle() IS 'Trigger trg_vessels_sync_lifecycle: keeps the legacy status and lifecycle_status consistent (Sold <=> archived) and stamps or clears the archive columns: archiving under a JWT stamps the caller and now(), a JWT update of an archived row keeps the stored stamp, no JWT keeps a given archived_at (D-230); not archived: both NULL.';
