-- P1 vessel codes: SQL == TS on the generated corpus (spec §A.1, §E; D-03,
-- D-25). supabase/tests/fixtures/vessel-code-corpus.json is written by
-- scripts/db/gen-vessel-code-corpus.mjs from src/modules/vessels/lib/vesselCode.ts.
--
-- The fixture is parsed once into temporary tables (a jsonb read per row
-- would detoast the whole corpus every time).

\set corpus `cat supabase/tests/fixtures/vessel-code-corpus.json`
CREATE TEMP TABLE corpus ON COMMIT DROP AS SELECT :'corpus'::jsonb AS j;

SELECT tests.is((SELECT j ->> 'generator' FROM corpus), 'scripts/db/gen-vessel-code-corpus.mjs', 'the corpus names its generator');
\set src_sha `sha256sum src/modules/vessels/lib/vesselCode.ts | cut -c1-64`
SELECT tests.is((SELECT j -> 'sourceSha256' ->> 'src/modules/vessels/lib/vesselCode.ts' FROM corpus), :'src_sha',
  'the corpus was generated from the current vesselCode.ts (else regenerate it: node scripts/db/gen-vessel-code-corpus.mjs)');

-- ------------------------------------------------------------ the JS tables the SQL spells out

CREATE TEMP TABLE corpus_ws ON COMMIT DROP AS
  SELECT ('x' || lpad(cp, 8, '0'))::bit(32)::int AS cp FROM jsonb_array_elements_text((SELECT j -> 'jsWhitespace' FROM corpus)) AS cp;
SELECT tests.is((SELECT count(*) FROM corpus_ws), 25::bigint, 'JS \s matches 25 BMP code points');
SELECT tests.is_empty(
  $q$SELECT cp FROM corpus_ws WHERE public.normalise_code_text('A' || chr(cp)) <> 'A' OR public.normalise_code_text(chr(cp) || 'b') <> 'B'$q$,
  'normalise_code_text trims exactly the JS whitespace set (every JS \s code point is trimmed)'
);
SELECT tests.is_empty(
  $q$SELECT cp FROM generate_series(1, 65535) AS cp
     WHERE cp NOT BETWEEN 55296 AND 57343 AND cp NOT IN (SELECT cp FROM corpus_ws)
       AND public.normalise_code_text(chr(cp) || 'B') = 'B'$q$,
  'no other BMP code point is trimmed'
);

CREATE TEMP TABLE corpus_special ON COMMIT DROP AS
  SELECT e ->> 'char' AS ch, e ->> 'letters' AS letters FROM jsonb_array_elements((SELECT j -> 'specialUpper' FROM corpus)) AS e;
SELECT tests.is((SELECT count(*) FROM corpus_special), 12::bigint, 'the JS special upper-case table has 12 entries (ß ı ŉ ſ ẚ ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ)');
SELECT tests.is_empty(
  $q$SELECT ch, letters, public.vessel_code_letters(ch) AS got FROM corpus_special WHERE public.vessel_code_letters(ch) <> letters$q$,
  'vessel_code_letters applies every special upper-case expansion'
);

CREATE TEMP TABLE corpus_stored_upper ON COMMIT DROP AS
  SELECT e ->> 'char' AS ch, e ->> 'upper' AS upper FROM jsonb_array_elements((SELECT j -> 'storedUpper' FROM corpus)) AS e;
SELECT tests.is_empty(
  $q$SELECT ch, upper, public.normalise_code_text(ch) AS got FROM corpus_stored_upper WHERE public.normalise_code_text(ch) <> upper$q$,
  'normalise_code_text applies every JS upper-case expansion whose result is A-Z'
);

-- ------------------------------------------------------------ every BMP code point as a one-character name

CREATE TEMP TABLE corpus_cp ON COMMIT DROP AS
  SELECT ('x' || lpad(key, 8, '0'))::bit(32)::int AS cp, value AS letters
  FROM jsonb_each_text((SELECT j -> 'singleCodePoints' FROM corpus));
SELECT tests.is((SELECT count(*) FROM corpus_cp), 555::bigint, '555 BMP code points give letters in the TS');
SELECT tests.is((SELECT (j ->> 'nonBmpWithLetters')::int FROM corpus), 0, 'no code point above U+FFFF gives letters in the TS');
SELECT tests.is_empty(
  $q$SELECT to_hex(g.cp) AS cp, public.vessel_code_letters(chr(g.cp)) AS sql, coalesce(c.letters, 'VSL') AS ts
     FROM generate_series(1, 65535) AS g(cp)
     LEFT JOIN corpus_cp AS c ON c.cp = g.cp
     WHERE g.cp NOT BETWEEN 55296 AND 57343
       AND public.vessel_code_letters(chr(g.cp)) IS DISTINCT FROM coalesce(c.letters, 'VSL')$q$,
  'vessel_code_letters = vesselCodeLetters for every BMP code point (65,534 one-character names)'
);
SELECT tests.is_empty(
  $q$SELECT to_hex(cp) AS cp, public.vessel_code_letters(chr(cp)) AS sql
     FROM generate_series(65536, 131071) AS cp
     WHERE public.vessel_code_letters(chr(cp)) <> 'VSL'$q$,
  'no code point of plane 1 gives letters in SQL either'
);

-- ------------------------------------------------------------ names: letters and the first 12 candidates

CREATE TEMP TABLE corpus_names ON COMMIT DROP AS
  SELECT e ->> 'name' AS name, e ->> 'letters' AS letters,
         ARRAY(SELECT jsonb_array_elements_text(e -> 'candidates')) AS candidates,
         e -> 'tags' AS tags
  FROM jsonb_array_elements((SELECT j -> 'names' FROM corpus)) AS e;
SELECT tests.ok((SELECT count(*) FROM corpus_names) > 1000, 'the corpus has more than 1,000 names');
SELECT tests.ok((SELECT count(*) FROM corpus_names WHERE tags ? 'latin-letter') > 300, 'every Latin-1 Supplement and Latin Extended-A/B letter is a one-letter name');
SELECT tests.ok((SELECT count(*) FROM corpus_names WHERE tags ? 'prefix') > 300, 'prefix forms with every separator, Unicode spaces and none');
SELECT tests.is_empty(
  $q$SELECT name, letters, public.vessel_code_letters(name) AS sql FROM corpus_names WHERE public.vessel_code_letters(name) IS DISTINCT FROM letters$q$,
  'vessel_code_letters = vesselCodeLetters for every corpus name (prefixes, separators, Unicode spaces, short and letterless names)'
);
SELECT tests.is_empty(
  $q$SELECT name, candidates, public.vessel_code_candidates(name) AS sql FROM corpus_names WHERE public.vessel_code_candidates(name) IS DISTINCT FROM candidates$q$,
  'vessel_code_candidates(name) = vesselCodeCandidates(name) (12 by default) for every corpus name'
);
SELECT tests.is(public.vessel_code_letters(NULL), 'VSL', 'a NULL name has no letters: VSL');
SELECT tests.is(public.vessel_code_candidates(NULL), ARRAY['VSL', 'VS1', 'VS2', 'VS3', 'VS4', 'VS5', 'VS6', 'VS7', 'VS8', 'VS9', 'VS0', 'VAA'], 'a NULL name gives the VSL candidates');

-- ------------------------------------------------------------ every candidate, and odd limits

SELECT tests.is_empty(
  $q$SELECT e ->> 'name' AS name, cardinality(public.vessel_code_candidates(e ->> 'name', 2000)) AS sql_count
     FROM jsonb_array_elements((SELECT j -> 'fullCandidates' FROM corpus)) AS e
     WHERE public.vessel_code_candidates(e ->> 'name', 2000) IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(e -> 'candidates'))$q$,
  'every candidate, in order (limit 2000), equals the TS for A, Y, Rhythm, M/Y Draak, HYDRA, AEIOU, the empty name, ß and ZZ'
);
SELECT tests.is_empty(
  $q$SELECT e ->> 'name' AS name, e ->> 'limit' AS lim
     FROM jsonb_array_elements((SELECT j -> 'limits' FROM corpus)) AS e
     WHERE public.vessel_code_candidates(e ->> 'name', (e ->> 'limit')::int) IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(e -> 'candidates'))$q$,
  'odd limits (-5, 0, 1, 2, 3, 12, 13, 1308, 5000) cut the list exactly as the TS does'
);

-- ------------------------------------------------------------ stored codes

SELECT tests.is_empty(
  $q$SELECT e ->> 'code' AS code, e ->> 'stored' AS ts, public.vessel_code_stored(e ->> 'code') AS sql
     FROM jsonb_array_elements((SELECT j -> 'stored' FROM corpus)) AS e
     WHERE public.vessel_code_stored(e ->> 'code') IS DISTINCT FROM (e ->> 'stored')$q$,
  'vessel_code_stored = storedVesselCode (trim, JS upper case incl. ß→SS and ﬁ→FI, pattern) for every case'
);

-- ------------------------------------------------------------ fleets: assignVesselCodes

CREATE TEMP TABLE corpus_fleets ON COMMIT DROP AS
  SELECT e ->> 'key' AS key, (e ->> 'tableSafe')::boolean AS table_safe, (e ->> 'triggerSafe')::boolean AS trigger_safe,
         e -> 'vessels' AS vessels, e -> 'expected' AS expected
  FROM jsonb_array_elements((SELECT j -> 'fleets' FROM corpus)) AS e;
SELECT tests.ok((SELECT count(*) FROM corpus_fleets) >= 200, 'at least 200 seeded fleets');
SELECT tests.ok((SELECT min(jsonb_array_length(vessels)) >= 2 AND max(jsonb_array_length(vessels)) = 30 FROM corpus_fleets), 'fleets of 2 to 30 vessels');
SELECT tests.ok(
  (SELECT count(*) FROM corpus_fleets AS f, jsonb_array_elements(f.vessels) AS a, jsonb_array_elements(f.vessels) AS b
    WHERE a ->> 'id' < b ->> 'id' AND a ->> 'created_at' <> b ->> 'created_at'
      AND date_trunc('milliseconds', (a ->> 'created_at')::timestamptz) = date_trunc('milliseconds', (b ->> 'created_at')::timestamptz)) > 100,
  'the corpus holds many vessel pairs with millisecond-equal created_at and different microseconds'
);
SELECT tests.is_empty(
  $q$SELECT key, (SELECT jsonb_object_agg(a.vessel_id::text, a.code) FROM public.vessel_codes_assign(vessels) AS a) AS sql, expected AS ts
     FROM corpus_fleets
     WHERE (SELECT jsonb_object_agg(a.vessel_id::text, a.code) FROM public.vessel_codes_assign(vessels) AS a) IS DISTINCT FROM expected$q$,
  'vessel_codes_assign = assignVesselCodes for every fleet (collisions, ms-equal dates, missing dates, duplicate ids, clashing and invalid stored codes)'
);
SELECT tests.is((SELECT count(*) FROM public.vessel_codes_assign('[]'::jsonb)), 0::bigint, 'an empty fleet has no codes');
SELECT tests.is((SELECT count(*) FROM public.vessel_codes_assign(NULL)), 0::bigint, 'a NULL fleet has no codes');
