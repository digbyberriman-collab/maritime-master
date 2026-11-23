-- Record engine parity (spec §A.10; D-30, D-32, D-51): record_transition_decide()
-- equals transitionEnvelope() on 100 % of record-transitions.json (error
-- codes, and the whole outcome value with the effects in TS order), and
-- record_vessel_signatures_locked() equals vesselSignaturesLocked() on
-- 100 % of record-vessel-lock.json. Both fixtures come from the frozen
-- companyStep.ts (scripts/db/gen-record-fixtures.mjs).

\set transitions `cat supabase/tests/fixtures/record-transitions.json`
\set lock `cat supabase/tests/fixtures/record-vessel-lock.json`
\set src_sha `sha256sum src/lib/records/companyStep.ts | cut -c1-64`

SELECT tests.is((:'transitions'::jsonb) -> 'sourceSha256' ->> 'src/lib/records/companyStep.ts', :'src_sha',
  'record-transitions.json was generated from the current companyStep.ts (else: node scripts/db/gen-record-fixtures.mjs)');
SELECT tests.is((:'lock'::jsonb) -> 'sourceSha256' ->> 'src/lib/records/companyStep.ts', :'src_sha',
  'record-vessel-lock.json was generated from the current companyStep.ts');

CREATE TEMP TABLE t_values ON COMMIT DROP AS
SELECT (ord - 1)::integer AS idx, v FROM jsonb_array_elements((:'transitions'::jsonb) -> 'values') WITH ORDINALITY AS x(v, ord);
CREATE TEMP TABLE t_cases ON COMMIT DROP AS
SELECT ord, c -> 'state' AS state, c -> 'input' AS input, c -> 'expected' AS expected
FROM jsonb_array_elements((:'transitions'::jsonb) -> 'cases') WITH ORDINALITY AS x(c, ord);

SELECT tests.is((SELECT count(*) FROM t_cases), ((:'transitions'::jsonb) #>> '{counts,cases}')::bigint, 'every case is loaded');
SELECT tests.ok((SELECT count(*) FROM t_cases) >= 11720, format('lattice + guards + history + >= 5000 random cases (%s)', (SELECT count(*) FROM t_cases)));
SELECT tests.ok(((:'transitions'::jsonb) #>> '{counts,random}')::integer >= 5000, 'at least 5000 seeded random cases');

CREATE TEMP TABLE t_results ON COMMIT DROP AS
SELECT c.ord, c.state, c.input, c.expected,
       public.record_transition_decide(c.state, c.input) AS got,
       CASE WHEN jsonb_typeof(c.expected) = 'number' THEN jsonb_build_object('ok', true, 'value', v.v) END AS want_ok
FROM t_cases AS c
LEFT JOIN t_values AS v ON v.idx = CASE WHEN jsonb_typeof(c.expected) = 'number' THEN (c.expected #>> '{}')::integer END;

-- NULL-safe: a NULL answer, a missing ok / error.code / error.message, or a JSON-null expectation is a mismatch,
-- never a row that drops out of the filter (NOT NULL is NULL), so the gate cannot pass vacuously.
CREATE TEMP TABLE t_mismatch ON COMMIT DROP AS
SELECT * FROM t_results
WHERE got IS NULL OR NOT coalesce(CASE
  WHEN jsonb_typeof(expected) = 'number' THEN got = want_ok
  ELSE (got ->> 'ok') = 'false' AND got #>> '{error,code}' = expected #>> '{}' AND length(got #>> '{error,message}') > 0
END, false);

SELECT tests.is((SELECT count(*) FROM t_results WHERE got IS NULL), 0::bigint, 'no case answers NULL');
SELECT tests.is((SELECT count(*) FROM t_results WHERE jsonb_typeof(got -> 'ok') IS DISTINCT FROM 'boolean'), 0::bigint,
  'every answer is an envelope with a boolean ok');
SELECT tests.is((SELECT count(*) FROM t_mismatch), 0::bigint,
  format('record_transition_decide = transitionEnvelope on all %s cases%s', (SELECT count(*) FROM t_results),
    coalesce(' # first mismatches: ' || (SELECT string_agg(format('case %s state=%s input=%s want=%s got=%s', ord, state, input, coalesce(want_ok, expected), got), ' | ')
                                          FROM (SELECT * FROM t_mismatch ORDER BY ord LIMIT 3) AS m), '')));
SELECT tests.is((SELECT count(*) FILTER (WHERE got ->> 'ok' = 'true') FROM t_results), ((:'transitions'::jsonb) #>> '{counts,ok}')::bigint, 'the same number of allowed transitions');
-- Spot checks that the comparison really looks at the value and the effect order.
SELECT tests.ok(EXISTS (SELECT 1 FROM t_results WHERE got #> '{value,effects}' = '["snapshot", "supersede_vessel_signatures", "new_cycle"]'::jsonb), 'return / not approved effects in TS order are covered');
SELECT tests.ok(EXISTS (SELECT 1 FROM t_results WHERE got #> '{value,effects}' = '["company_acknowledgement", "company_signature", "snapshot"]'::jsonb), 'acknowledge-and-close effects in TS order are covered');
SELECT tests.ok(EXISTS (SELECT 1 FROM t_results WHERE got #>> '{error,code}' = 'already_acknowledged'), 'already_acknowledged is covered');
SELECT tests.ok(EXISTS (SELECT 1 FROM t_results WHERE got #>> '{error,code}' = 'version_conflict'), 'version_conflict is covered');
SELECT tests.is((SELECT count(DISTINCT got #>> '{error,code}') FROM t_results WHERE NOT (got ->> 'ok')::boolean), 13::bigint, 'every TransitionErrorCode appears');

-- The engine is pure and fail-closed on nonsense.
SELECT tests.is(public.record_transition_decide('{"status":"open","companyStep":"none"}', '{"action":"fly","actor":"vessel"}') #>> '{error,code}', 'invalid_action', 'an unknown action is invalid_action');
SELECT tests.is(public.record_transition_decide(NULL, NULL) #>> '{error,code}', 'invalid_action', 'no input is refused');
SELECT tests.is(public.record_transition_decide('{"companyStep":"sign_off"}', '{"action":"sign_off","actor":"company"}') #>> '{error,code}', 'invalid_transition', 'no status is invalid_transition');
SELECT tests.ok((SELECT provolatile = 'i' AND NOT prosecdef FROM pg_proc WHERE oid = 'public.record_transition_decide(jsonb,jsonb)'::regprocedure), 'record_transition_decide is IMMUTABLE and SECURITY INVOKER');

-- ------------------------------------------------------------ the D-51 lock

CREATE TEMP TABLE l_results ON COMMIT DROP AS
SELECT ord, c -> 'state' AS state, (c ->> 'sheetCycle')::integer AS sheet_cycle, (c ->> 'expected')::boolean AS want,
       public.record_vessel_signatures_locked(c -> 'state', (c ->> 'sheetCycle')::integer) AS got
FROM jsonb_array_elements((:'lock'::jsonb) -> 'cases') WITH ORDINALITY AS x(c, ord);
SELECT tests.is((SELECT count(*) FROM l_results), ((:'lock'::jsonb) #>> '{counts,cases}')::bigint, 'every lock case is loaded');
SELECT tests.is((SELECT count(*) FROM l_results WHERE got IS DISTINCT FROM want), 0::bigint,
  format('record_vessel_signatures_locked = vesselSignaturesLocked on all %s cases%s', (SELECT count(*) FROM l_results),
    coalesce(' # first mismatches: ' || (SELECT string_agg(format('state=%s sheet=%s want=%s got=%s', state, sheet_cycle, want, got), ' | ')
                                          FROM (SELECT * FROM l_results WHERE got IS DISTINCT FROM want ORDER BY ord LIMIT 3) AS m), '')));
SELECT tests.is((SELECT count(*) FROM l_results WHERE got), ((:'lock'::jsonb) #>> '{counts,locked}')::bigint, 'the same number of locked sheets');
SELECT tests.ok(NOT public.record_vessel_signatures_locked('{"status":"closed","closedBy":"company_sign_off"}', NULL), 'no sheet cycle: not locked');
