-- P1 columns and backfill (spec §A.1): the columns as the contract lists
-- them, the backfill of the replayed legacy fleet, the backfill run end to
-- end on corpus fleets (by re-running the migration on rows without a
-- code), and the set-code trigger on fleets inserted one by one.

\set corpus `cat supabase/tests/fixtures/vessel-code-corpus.json`
CREATE TEMP TABLE corpus_fleets ON COMMIT DROP AS
  SELECT e ->> 'key' AS key, (e ->> 'tableSafe')::boolean AS table_safe, (e ->> 'triggerSafe')::boolean AS trigger_safe,
         e -> 'vessels' AS vessels, e -> 'expected' AS expected
  FROM jsonb_array_elements((:'corpus'::jsonb) -> 'fleets') AS e;

-- ------------------------------------------------------------ the columns (contract)

SELECT tests.is(
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessels'
     AND column_name IN ('code', 'short_code', 'lifecycle_status', 'is_counted', 'vessel_purpose', 'archived_at', 'archived_by', 'archive_reason')),
  8::bigint, 'check query: the 8 P1 columns exist on public.vessels');
SELECT tests.results_eq(
  $q$SELECT column_name::text, data_type::text, is_nullable::text, coalesce(column_default, '')::text
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessels'
       AND column_name IN ('code', 'short_code', 'lifecycle_status', 'is_counted', 'vessel_purpose', 'archived_at', 'archived_by', 'archive_reason')$q$,
  $q$VALUES ('code', 'text', 'NO', ''), ('short_code', 'text', 'YES', ''), ('lifecycle_status', 'text', 'NO', '''active''::text'),
            ('is_counted', 'boolean', 'NO', 'true'), ('vessel_purpose', 'text', 'NO', '''operational''::text'),
            ('archived_at', 'timestamp with time zone', 'YES', ''), ('archived_by', 'uuid', 'YES', ''), ('archive_reason', 'text', 'YES', '')$q$,
  'column types, nullability and defaults match the contract (VesselTenancyColumns)');
SELECT tests.results_eq(
  $q$SELECT conname::text FROM pg_constraint WHERE conrelid = 'public.vessels'::regclass
       AND conname IN ('vessels_code_format', 'vessels_short_code_format', 'vessels_lifecycle_status_check', 'vessels_vessel_purpose_check', 'vessels_archive_reason_length', 'vessels_archived_by_fkey')$q$,
  $q$VALUES ('vessels_code_format'), ('vessels_short_code_format'), ('vessels_lifecycle_status_check'), ('vessels_vessel_purpose_check'), ('vessels_archive_reason_length'), ('vessels_archived_by_fkey')$q$,
  'the named constraints exist');
SELECT tests.results_eq(
  $q$SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'vessels'
       AND indexname IN ('vessels_company_code_key', 'vessels_company_short_code_key', 'idx_vessels_company_lifecycle')$q$,
  $q$VALUES ('vessels_company_code_key'), ('vessels_company_short_code_key'), ('idx_vessels_company_lifecycle')$q$,
  'the indexes exist');
SELECT tests.ok((SELECT indisunique FROM pg_index WHERE indexrelid = 'public.vessels_company_code_key'::regclass), 'vessels_company_code_key is unique');

-- ------------------------------------------------------------ the replayed legacy fleet was backfilled

SELECT tests.results_eq(
  $q$SELECT name, code FROM public.vessels WHERE company_id = '11111111-1111-1111-1111-111111111111'$q$,
  $q$VALUES ('Inkfish', 'INK'), ('Rocinante', 'ROC'), ('Fleet-Wide', 'FLE')$q$,
  'the legacy seed fleet got the codes users already see (INK, ROC, FLE)');
SELECT tests.is_empty(
  $q$SELECT v.id, v.code, c.code FROM public.vessels AS v JOIN LATERAL public.vessel_codes_for_company(v.company_id) AS c ON c.vessel_id = v.id WHERE c.code IS DISTINCT FROM v.code$q$,
  'every stored code equals the client derivation for its company');
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE code IS NULL), 0::bigint, 'no vessel is left without a code');

-- ------------------------------------------------------------ the backfill, end to end, on corpus fleets

-- Put corpus fleets in as they would be before P1 (no code unless stored,
-- no trigger), then re-run the migration: the backfill must give exactly
-- assignVesselCodes(). vessels.name is NOT NULL, so a NULL corpus name goes
-- in as '' (both have no letters: same codes). Every seventh vessel is
-- Sold with an older updated_at, for the lifecycle backfill.
ALTER TABLE public.vessels DISABLE TRIGGER trg_vessels_set_code;
ALTER TABLE public.vessels DISABLE TRIGGER trg_vessels_sync_lifecycle;
ALTER TABLE public.vessels ALTER COLUMN code DROP NOT NULL;
INSERT INTO public.companies (id, name)
  SELECT tests.id('corpus:' || key), 'Corpus ' || key FROM corpus_fleets WHERE table_safe
  ON CONFLICT (id) DO NOTHING;
INSERT INTO public.vessels (id, company_id, name, created_at, updated_at, code, status, lifecycle_status)
  SELECT (v ->> 'id')::uuid, tests.id('corpus:' || f.key), coalesce(v ->> 'name', ''), (v ->> 'created_at')::timestamptz,
         '2025-05-05T05:05:05Z'::timestamptz, v ->> 'code', CASE WHEN t.ord % 7 = 0 THEN 'Sold' ELSE 'Active' END, 'active'
  FROM corpus_fleets AS f CROSS JOIN LATERAL jsonb_array_elements(f.vessels) WITH ORDINALITY AS t(v, ord)
  WHERE f.table_safe;
SELECT tests.ok((SELECT count(*) FROM corpus_fleets WHERE table_safe) >= 20, 'at least 20 corpus fleets go through the real backfill');
SELECT tests.ok((SELECT count(*) FROM public.vessels WHERE code IS NULL) > 100, 'more than 100 corpus vessels wait for a code before the re-run');

\i supabase/migrations/20261123000100_platform_vessel_tenancy.sql

SELECT tests.is_empty(
  $q$SELECT f.key FROM corpus_fleets AS f
     WHERE f.table_safe
       AND (SELECT jsonb_object_agg(v.id::text, v.code) FROM public.vessels AS v WHERE v.company_id = tests.id('corpus:' || f.key)) IS DISTINCT FROM f.expected$q$,
  'the backfill gives every corpus fleet exactly assignVesselCodes() (stored codes kept, sold vessels counted)');
SELECT tests.is((SELECT count(*) FROM public.vessels WHERE code IS NULL), 0::bigint, 'the re-run leaves no vessel without a code');
SELECT tests.is((SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessels' AND column_name = 'code')::text, 'NO', 'code is NOT NULL again after the re-run');
SELECT tests.is(
  (SELECT count(*) FROM public.vessels AS v JOIN corpus_fleets AS f ON v.company_id = tests.id('corpus:' || f.key)
    WHERE v.status = 'Sold' AND (v.lifecycle_status <> 'archived' OR v.archived_at IS DISTINCT FROM '2025-05-05T05:05:05Z'::timestamptz)),
  0::bigint, 'every Sold vessel is archived, archived_at = its last update before the migration');
SELECT tests.ok((SELECT count(*) FROM public.vessels AS v JOIN corpus_fleets AS f ON v.company_id = tests.id('corpus:' || f.key) WHERE v.status = 'Sold') > 20, 'the lifecycle backfill saw Sold vessels');
SELECT tests.is(
  (SELECT count(*) FROM public.vessels AS v JOIN corpus_fleets AS f ON v.company_id = tests.id('corpus:' || f.key)
    WHERE v.status <> 'Sold' AND (v.lifecycle_status <> 'active' OR v.archived_at IS NOT NULL)),
  0::bigint, 'other vessels stay active');
SELECT tests.is(
  (SELECT string_agg(tgname::text || ':' || tgenabled::text, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.vessels'::regclass AND tgname IN ('trg_vessels_set_code', 'trg_vessels_sync_lifecycle')),
  'trg_vessels_set_code:O,trg_vessels_sync_lifecycle:O', 'the re-run recreates both triggers, enabled');

-- ------------------------------------------------------------ the set-code trigger on new vessels

-- Fleets without stored codes, inserted one at a time in collision order:
-- each new vessel takes the first candidate no earlier vessel holds, which
-- is what assignVesselCodes gives.
DO $$
DECLARE
  r record;
BEGIN
  INSERT INTO public.companies (id, name)
    SELECT tests.id('corpus-trigger:' || key), 'Corpus trigger ' || key FROM corpus_fleets WHERE trigger_safe
    ON CONFLICT (id) DO NOTHING;
  FOR r IN
    SELECT f.key, (v ->> 'id')::uuid AS id, coalesce(v ->> 'name', '') AS name, (v ->> 'created_at')::timestamptz AS created_at
    FROM corpus_fleets AS f CROSS JOIN LATERAL jsonb_array_elements(f.vessels) AS v
    WHERE f.trigger_safe
    ORDER BY f.key, date_trunc('milliseconds', (v ->> 'created_at')::timestamptz), (v ->> 'id')::uuid
  LOOP
    -- the ids are reused under another company, so derive new ones
    INSERT INTO public.vessels (id, company_id, name, created_at)
    VALUES (tests.id('corpus-trigger:' || r.id::text), tests.id('corpus-trigger:' || r.key), r.name, r.created_at);
  END LOOP;
END
$$;
SELECT tests.ok((SELECT count(*) FROM corpus_fleets WHERE trigger_safe) >= 15, 'at least 15 corpus fleets go through the trigger one vessel at a time');
SELECT tests.is_empty(
  $q$SELECT f.key FROM corpus_fleets AS f
     WHERE f.trigger_safe
       AND (SELECT jsonb_object_agg(e.key, v.code)
              FROM jsonb_each_text(f.expected) AS e
              JOIN public.vessels AS v ON v.id = tests.id('corpus-trigger:' || e.key))
           IS DISTINCT FROM f.expected$q$,
  'the trigger, vessel by vessel in collision order, gives assignVesselCodes() for every fleet without stored codes');
