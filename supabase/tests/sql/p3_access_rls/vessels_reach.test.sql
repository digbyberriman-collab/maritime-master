-- Vessel reads per persona (spec §A.8; D-25, D-124): every user of
-- supabase/tests/fixtures/reach-cases.json reads exactly the vessels the
-- membership reach expects, every vessel of their company when they have
-- fleet reach or the interim HR-view exception, and nothing when inactive.

\set fixture `cat supabase/tests/fixtures/reach-cases.json`
SELECT tests.seed_reach_world(:'fixture'::jsonb);

CREATE TEMP TABLE expected_reads ON COMMIT DROP AS
SELECT u ->> 'key' AS user_key,
       public.user_is_active(tests.user_id(u ->> 'key')) AS active,
       coalesce(public.hr_can_view(tests.user_id(u ->> 'key')), false) AS hr_view,
       (u #>> '{expected,membership,fleetReach}')::boolean AS fleet,
       CASE
         WHEN NOT public.user_is_active(tests.user_id(u ->> 'key')) THEN ARRAY[]::uuid[]
         WHEN (u #>> '{expected,membership,fleetReach}')::boolean OR coalesce(public.hr_can_view(tests.user_id(u ->> 'key')), false) THEN
           ARRAY(SELECT tests.vessel_id(v ->> 'key') FROM jsonb_array_elements(:'fixture'::jsonb -> 'vessels') AS v WHERE v ->> 'company' = u ->> 'company')
         ELSE ARRAY(SELECT tests.vessel_id(x) FROM jsonb_array_elements_text(u #> '{expected,membership,vessels}') AS x)
       END AS vessel_ids
FROM jsonb_array_elements(:'fixture'::jsonb -> 'users') AS u;
GRANT SELECT ON expected_reads TO authenticated;

SELECT tests.is((SELECT count(*) FROM expected_reads), 25::bigint, 'the fixture has 25 users');
SELECT tests.ok((SELECT count(*) FROM expected_reads WHERE hr_view AND NOT fleet AND active) >= 1, 'at least one persona reads the fleet through the HR exception only');
SELECT tests.ok((SELECT count(*) FROM expected_reads WHERE NOT active) >= 2, 'inactive personas are covered');

DO $$
DECLARE e record;
BEGIN
  FOR e IN SELECT * FROM expected_reads ORDER BY user_key LOOP
    PERFORM tests.as_user(tests.user_id(e.user_key));
    PERFORM tests.results_eq(
      'SELECT id FROM public.vessels',
      format('SELECT unnest(%L::uuid[])', e.vessel_ids),
      format('%s reads %s vessel(s)%s', e.user_key, cardinality(e.vessel_ids),
             CASE WHEN NOT e.active THEN ' (inactive)' WHEN e.fleet THEN ' (fleet reach)' WHEN e.hr_view THEN ' (HR view exception)' ELSE ' (reach)' END));
  END LOOP;
END
$$;
SELECT tests.reset_role();

-- Every visible row stays in the reader's company.
DO $$
DECLARE e record;
BEGIN
  FOR e IN SELECT * FROM expected_reads WHERE active ORDER BY user_key LOOP
    PERFORM tests.as_user(tests.user_id(e.user_key));
    PERFORM tests.is_empty(
      format('SELECT 1 FROM public.vessels WHERE company_id IS DISTINCT FROM %L', (SELECT company_id FROM public.profiles WHERE user_id = tests.user_id(e.user_key))),
      e.user_key || ' reads no vessel of another company');
  END LOOP;
END
$$;
SELECT tests.reset_role();
