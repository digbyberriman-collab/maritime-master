-- Record references (spec §A.6; C21, D-126): format_reference_text(),
-- format_voyage_reference_text() and reference_counter_scope() == the TS on
-- every case of reference-cases.json; format_reference() /
-- format_voyage_reference() allocate race-safe counters per company / kind
-- / vessel / year, refuse foreign ids and callers without reach, and are
-- service role only.

\set cases `cat supabase/tests/fixtures/reference-cases.json`
CREATE TEMP TABLE ref_fixture ON COMMIT DROP AS SELECT :'cases'::jsonb AS j;
SELECT tests.is((SELECT j ->> 'generator' FROM ref_fixture), 'scripts/db/gen-reference-fixture.mjs', 'the fixture names its generator');
\set src_sha `sha256sum src/lib/records/reference.ts | cut -c1-64`
\set dates_sha `sha256sum src/lib/records/dates.ts | cut -c1-64`
SELECT tests.ok((SELECT j -> 'sourceSha256' ->> 'src/lib/records/reference.ts' = :'src_sha' AND j -> 'sourceSha256' ->> 'src/lib/records/dates.ts' = :'dates_sha' FROM ref_fixture),
  'the fixture was generated from the current reference.ts and dates.ts (else regenerate it: node scripts/db/gen-reference-fixture.mjs)');

-- Runs every SQL-representable case of a section; returns the mismatches.
CREATE FUNCTION pg_temp.reference_mismatches(p_section text) RETURNS text[]
LANGUAGE plpgsql AS $$
DECLARE
  c jsonb;
  v_got text;
  v_state text;
  v_bad text[] := ARRAY[]::text[];
BEGIN
  FOR c IN SELECT e FROM ref_fixture, jsonb_array_elements(j -> p_section) AS e WHERE jsonb_typeof(e -> 'sql') = 'object' LOOP
    v_got := NULL;
    v_state := NULL;
    BEGIN
      IF p_section = 'recordCases' THEN
        v_got := public.format_reference_text(c -> 'sql' ->> 'type', c -> 'sql' ->> 'vesselCode', (c -> 'sql' ->> 'on')::date, (c -> 'sql' ->> 'seq')::int);
      ELSIF p_section = 'voyageCases' THEN
        v_got := public.format_voyage_reference_text(c -> 'sql' ->> 'vesselCode', (c -> 'sql' ->> 'on')::date, (c -> 'sql' ->> 'seq')::int);
      ELSE
        v_got := public.reference_counter_scope(c -> 'sql' ->> 'type', (c -> 'sql' ->> 'companyId')::uuid, (c -> 'sql' ->> 'vesselId')::uuid,
                                                (c -> 'sql' ->> 'on')::date, (c -> 'sql' ->> 'voyage')::boolean);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE;
    END;
    IF (c -> 'expected' ->> 'ok')::boolean THEN
      IF v_state IS NOT NULL OR v_got IS DISTINCT FROM c -> 'expected' ->> 'text' THEN
        v_bad := v_bad || format('%s -> %s (want %s)', c -> 'input', coalesce(v_got, 'error ' || v_state), c -> 'expected' ->> 'text');
      END IF;
    ELSIF v_state IS DISTINCT FROM '22023' THEN
      v_bad := v_bad || format('%s -> %s (want 22023: %s)', c -> 'input', coalesce(v_got, 'error ' || v_state), c -> 'expected' ->> 'error');
    END IF;
  END LOOP;
  RETURN v_bad;
END;
$$;

SELECT tests.ok((SELECT count(*) FROM ref_fixture, jsonb_array_elements(j -> 'recordCases') AS e WHERE jsonb_typeof(e -> 'sql') = 'object') > 300, 'more than 300 record cases reach SQL');
SELECT tests.is(pg_temp.reference_mismatches('recordCases'), ARRAY[]::text[], 'format_reference_text = formatReference for every record case (same text, or 22023 where the TS throws)');
SELECT tests.is(pg_temp.reference_mismatches('voyageCases'), ARRAY[]::text[], 'format_voyage_reference_text = formatVoyageReference for every voyage case');
SELECT tests.is(pg_temp.reference_mismatches('scopeCases'), ARRAY[]::text[], 'reference_counter_scope = referenceCounterScope for every scope case');
SELECT tests.is(public.format_reference_text('PTW', 'DRA', DATE '2026-11-23', 1000), 'PTW-DRA-2026-1000', 'the counter grows past 999 (never cut to three digits)');
SELECT tests.is(public.format_voyage_reference_text('dra', DATE '2026-11-03', 37), 'DRA-20261103-037', 'a voyage reference');

-- ------------------------------------------------------------ allocation

SELECT tests.seed_two_tenants();
SELECT tests.is(public.format_reference('PTW', tests.company_id('A'), tests.vessel_id('A.dra'), DATE '2026-11-23'), 'PTW-DRA-2026-001', 'the first PTW of DRA in 2026 is 001');
SELECT tests.is(public.format_reference('ptw', tests.company_id('A'), tests.vessel_id('A.dra'), DATE '2026-12-31'), 'PTW-DRA-2026-002', 'the next one of the same year is 002 (type upper-cased)');
SELECT tests.is(public.format_reference('PTW', tests.company_id('A'), tests.vessel_id('A.hyd'), DATE '2026-11-23'), 'PTW-HYD-2026-001', 'another vessel has its own counter');
SELECT tests.is(public.format_reference('PTW', tests.company_id('A'), tests.vessel_id('A.dra'), DATE '2027-01-01'), 'PTW-DRA-2027-001', 'another year has its own counter');
SELECT tests.is(public.format_reference('RA', tests.company_id('A'), tests.vessel_id('A.dra'), DATE '2026-11-23'), 'RA-DRA-2026-001', 'another type has its own counter');
SELECT tests.is(public.format_reference('AUD', tests.company_id('A'), NULL, DATE '2026-11-23'), 'AUD-2026-001', 'a fleet record');
SELECT tests.is(public.format_reference('AUD', tests.company_id('B'), NULL, DATE '2026-11-23'), 'AUD-2026-001', 'another company has its own counter');
SELECT tests.is(public.format_reference('AUD', tests.company_id('A'), NULL, DATE '2026-02-01'), 'AUD-2026-002', 'the fleet counter of company A goes on');
SELECT tests.is(public.format_voyage_reference(tests.company_id('A'), tests.vessel_id('A.dra'), DATE '2026-11-03'), 'DRA-20261103-001', 'a voyage reference');
SELECT tests.is(public.format_voyage_reference(tests.company_id('A'), tests.vessel_id('A.dra'), DATE '2026-11-03'), 'DRA-20261103-002', 'voyages count per vessel and day');
SELECT tests.is(public.format_voyage_reference(tests.company_id('A'), tests.vessel_id('A.dra'), DATE '2026-11-04'), 'DRA-20261104-001', 'a new day starts again');
SELECT tests.results_eq(
  format($q$SELECT scope, next_value FROM public.reference_counters WHERE scope LIKE '%%' || %L || '%%' OR scope LIKE '%%' || %L || '%%'$q$, tests.company_id('A'), tests.company_id('B')),
  format($q$VALUES ('ref:PTW:%1$s:%2$s:2026', 3), ('ref:PTW:%1$s:%3$s:2026', 2), ('ref:PTW:%1$s:%2$s:2027', 2), ('ref:RA:%1$s:%2$s:2026', 2),
                   ('ref:AUD:%1$s:fleet:2026', 3), ('ref:AUD:%4$s:fleet:2026', 2), ('voyage:%1$s:%2$s:20261103', 3), ('voyage:%1$s:%2$s:20261104', 2)$q$,
         tests.company_id('A'), tests.vessel_id('A.dra'), tests.vessel_id('A.hyd'), tests.company_id('B')),
  'the counters live in reference_counters under the referenceCounterScope keys (vessel ids, never codes)');
SELECT tests.throws_like(format($q$UPDATE public.vessels SET code = 'DRX' WHERE id = %L$q$, tests.vessel_id('A.dra')), '23514', 'vessel_code_locked', 'once a reference is numbered, the vessel code is locked');

SELECT tests.throws_like(format($q$SELECT public.format_reference('PTW', %L, %L)$q$, tests.company_id('A'), tests.vessel_id('B.lev')), '42501', 'reference_scope_denied', 'a vessel of another company is refused');
SELECT tests.throws_like(format($q$SELECT public.format_reference('PTW', %L, %L)$q$, tests.company_id('A'), gen_random_uuid()), '42501', 'reference_scope_denied', 'an unknown vessel is refused');
SELECT tests.throws_like($q$SELECT public.format_reference('PTW', gen_random_uuid())$q$, '42501', 'reference_scope_denied', 'an unknown company is refused');
SELECT tests.throws_like(format($q$SELECT public.format_voyage_reference(%L, %L)$q$, tests.company_id('B'), tests.vessel_id('A.dra')), '42501', 'reference_scope_denied', 'a voyage of another company''s vessel is refused');
SELECT tests.throws_like(format($q$SELECT public.format_voyage_reference(%L, NULL)$q$, tests.company_id('A')), '22023', 'reference_voyage_needs_vessel', 'a voyage without a vessel is refused');
SELECT tests.throws_like(format($q$SELECT public.format_reference('1AB', %L, %L)$q$, tests.company_id('A'), tests.vessel_id('A.gam')), '22023', 'reference_type_invalid', 'an invalid type is refused');
SELECT tests.is((SELECT count(*) FROM public.reference_counters WHERE scope LIKE '%' || tests.vessel_id('A.gam') || '%'), 0::bigint, 'a refused call allocates nothing');

-- A definer acting for a signed-in user (as record_open_envelope will).
CREATE FUNCTION tests.zz_open_reference(p_type text, p_company uuid, p_vessel uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.format_reference(p_type, p_company, p_vessel, DATE '2026-11-23') $$;
GRANT EXECUTE ON FUNCTION tests.zz_open_reference(text, uuid, uuid) TO authenticated;
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is(tests.zz_open_reference('PTW', tests.company_id('A'), tests.vessel_id('A.dra')), 'PTW-DRA-2026-003', 'a user reaching the vessel gets a reference (through a definer)');
SELECT tests.throws_like(format($q$SELECT tests.zz_open_reference('PTW', %L, %L)$q$, tests.company_id('A'), tests.vessel_id('A.hyd')), '42501', 'reference_scope_denied', 'a user who does not reach the vessel is refused');
SELECT tests.throws_like(format($q$SELECT tests.zz_open_reference('AUD', %L, NULL)$q$, tests.company_id('A')), '42501', 'reference_scope_denied', 'a crew member cannot number a fleet record');
SELECT tests.throws_like(format($q$SELECT tests.zz_open_reference('PTW', %L, %L)$q$, tests.company_id('B'), tests.vessel_id('B.lev')), '42501', 'reference_scope_denied', 'a user of another company is refused');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(tests.zz_open_reference('AUD', tests.company_id('A'), NULL), 'AUD-2026-003', 'a fleet manager numbers a fleet record');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format($q$SELECT tests.zz_open_reference('PTW', %L, %L)$q$, tests.company_id('A'), tests.vessel_id('A.dra')), '42501', 'reference_scope_denied', 'a disabled user is refused');

-- ------------------------------------------------------------ privileges (rule 5)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws(format($q$SELECT public.format_reference('PTW', %L, %L)$q$, tests.company_id('A'), tests.vessel_id('A.dra')), '42501', 'authenticated cannot execute format_reference');
SELECT tests.throws(format($q$SELECT public.format_voyage_reference(%L, %L)$q$, tests.company_id('A'), tests.vessel_id('A.dra')), '42501', 'authenticated cannot execute format_voyage_reference');
SELECT tests.throws(format($q$SELECT public.reference_counter_scope('PTW', %L, NULL, current_date)$q$, tests.company_id('A')), '42501', 'authenticated cannot execute reference_counter_scope');
SELECT tests.is(public.format_reference_text('ptw', 'dra', DATE '2026-11-23', 61), 'PTW-DRA-2026-061', 'authenticated can format (display, search)');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT public.format_reference('PTW', %L, %L)$q$, tests.company_id('A'), tests.vessel_id('A.dra')), '42501', 'anon cannot execute format_reference');
SELECT tests.throws($q$SELECT public.format_reference_text('PTW', 'DRA', current_date, 1)$q$, '42501', 'anon cannot execute format_reference_text');
SELECT tests.as_service();
SELECT tests.is(public.format_reference('PTW', tests.company_id('A'), tests.vessel_id('A.gam'), DATE '2026-11-23'), 'PTW-GAM-2026-001', 'the service role allocates');
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT p.oid::regprocedure::text, coalesce(string_agg(a.grantee::regrole::text, ',' ORDER BY a.grantee::regrole::text) FILTER (WHERE a.grantee <> p.proowner), '')
     FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(p.proacl) AS a
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('format_reference_text', 'format_voyage_reference_text', 'reference_counter_scope', 'format_reference', 'format_voyage_reference')
     GROUP BY 1$q$,
  $q$VALUES ('format_reference_text(text,text,date,integer)', 'authenticated,service_role'), ('format_voyage_reference_text(text,date,integer)', 'authenticated,service_role'),
            ('reference_counter_scope(text,uuid,uuid,date,boolean)', 'service_role'), ('format_reference(text,uuid,uuid,date)', 'service_role'),
            ('format_voyage_reference(uuid,uuid,date)', 'service_role')$q$,
  'EXECUTE grants are exactly the spec''s');
