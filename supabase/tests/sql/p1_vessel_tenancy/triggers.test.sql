-- P1 triggers and privileges (spec §A.1): trg_vessels_set_code (derive,
-- normalise, refuse invalid codes, per-company uniqueness, advisory lock,
-- lock after numbering), trg_vessels_sync_lifecycle (Sold <=> archived,
-- the server's archive stamp, D-230), the column CHECKs, and the function
-- ACLs (rule 5; D-231: the derivation helpers are service role only).

SELECT tests.seed_company('T');
SELECT tests.seed_company('U');
SELECT tests.seed_vessel('T', 'T.dra', 'M/Y DRAAK', 'Active', NULL, '2026-01-01T00:00:00Z');

-- ------------------------------------------------------------ deriving and normalising

SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.dra')), 'DRA', 'a new vessel without a code takes its plain code (M/Y DRAAK -> DRA)');
SELECT tests.ok(
  (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted) > 0,
  'deriving a code takes a transaction advisory lock (per company)');
SELECT tests.seed_vessel('T', 'T.dra2', 'Draak II', 'Active', NULL, '2026-01-02T00:00:00Z');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.dra2')), 'DRK', 'a colliding name takes the next free candidate (Draak II -> DRK)');
SELECT tests.seed_vessel('T', 'T.dra3', 'DRAAK', 'Active', NULL, '2026-01-03T00:00:00Z');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.dra3')), 'DR1', 'the third DRAAK takes DR1');
SELECT tests.seed_vessel('U', 'U.dra', 'Draak', 'Active', NULL, '2026-01-04T00:00:00Z');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('U.dra')), 'DRA', 'codes are unique per company: another company gets DRA too');
SELECT tests.seed_vessel('T', 'T.given', 'Some Name', 'Active', '  hy1 ', '2026-01-05T00:00:00Z');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.given')), 'HY1', 'a given code is trimmed and upper-cased');
SELECT tests.seed_vessel('T', 'T.eszett', 'Other', 'Active', 'ßa', '2026-01-06T00:00:00Z');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.eszett')), 'SSA', 'a given code is upper-cased as JS does (ßa -> SSA)');
SELECT tests.throws_like(
  format($q$INSERT INTO public.vessels (company_id, name, code) VALUES (%L, 'Bad', 'D-1')$q$, tests.company_id('T')),
  '23514', 'vessel_code_invalid', 'an invalid given code is refused (vessel_code_invalid)');
SELECT tests.throws(
  format($q$INSERT INTO public.vessels (company_id, name, code) VALUES (%L, 'Twin', 'DRA')$q$, tests.company_id('T')),
  '23505', 'a given code already used in the company is refused (unique per company)');
SELECT tests.lives(
  format($q$INSERT INTO public.vessels (company_id, name, code) VALUES (%L, 'Twin', 'DRK')$q$, tests.company_id('U')),
  'the same code in another company is fine');
SELECT tests.lives(format($q$UPDATE public.vessels SET code = NULL WHERE id = %L$q$, tests.vessel_id('T.dra')), 'clearing the code (before any numbered record) asks for the derived one again');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.dra')), 'DRA', 'the cleared code is derived again (DRA), never left NULL');

-- ------------------------------------------------------------ fix-ups before numbering, lock after

SELECT tests.lives(format($q$UPDATE public.vessels SET code = 'dkx' WHERE id = %L$q$, tests.vessel_id('T.dra')), 'before any numbered record an admin may change the code');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.dra')), 'DKX', 'the changed code is normalised');
SELECT tests.throws_like(format($q$UPDATE public.vessels SET code = 'd!x' WHERE id = %L$q$, tests.vessel_id('T.dra')), '23514', 'vessel_code_invalid', 'an invalid new code is refused');
INSERT INTO public.reference_counters (scope, next_value)
VALUES ('ref:PTW:' || tests.company_id('T') || ':' || tests.vessel_id('T.dra') || ':2026', 2);
SELECT tests.throws_like(format($q$UPDATE public.vessels SET code = 'DRA' WHERE id = %L$q$, tests.vessel_id('T.dra')), '23514', 'vessel_code_locked', 'once a reference counter names the vessel, its code is locked');
SELECT tests.lives(format($q$UPDATE public.vessels SET code = ' dkx ' WHERE id = %L$q$, tests.vessel_id('T.dra')), 'writing the same code again (after normalising) is not a change');
SELECT tests.lives(format($q$UPDATE public.vessels SET name = 'M/Y DRAAK RENAMED' WHERE id = %L$q$, tests.vessel_id('T.dra')), 'other columns of a locked vessel still change');
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.dra')), 'DKX', 'a rename does not move the code');
SELECT tests.lives(format($q$UPDATE public.vessels SET code = 'DRX' WHERE id = %L$q$, tests.vessel_id('T.dra2')), 'a counter of another vessel does not lock this one');

DO $$
BEGIN
  IF to_regclass('public.record_envelopes') IS NULL THEN
    -- The record engine (file 10) is not in this database: stand in for it
    -- inside the rolled-back test transaction.
    CREATE TABLE public.record_envelopes (vessel_id uuid);
    INSERT INTO public.record_envelopes (vessel_id) VALUES (tests.vessel_id('T.dra3'));
    PERFORM tests.throws_like(format($q$UPDATE public.vessels SET code = 'DRZ' WHERE id = %L$q$, tests.vessel_id('T.dra3')), '23514', 'vessel_code_locked', 'once a record envelope belongs to the vessel, its code is locked');
  ELSE
    -- Covered with real envelopes by p4_registry (D3).
    PERFORM tests.ok(true, 'record_envelopes exists: the envelope lock is covered by the record-engine tests # SKIP');
  END IF;
END
$$;

-- ------------------------------------------------------------ Sold <=> archived

SELECT tests.seed_vessel('T', 'T.sold', 'Sold Boat', 'Sold', NULL, '2026-02-01T00:00:00Z');
SELECT tests.results_eq(
  format($q$SELECT status, lifecycle_status, archived_at IS NOT NULL FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.sold')),
  $q$VALUES ('Sold', 'archived', true)$q$, 'inserting a Sold vessel archives it');
SELECT tests.seed_vessel('T', 'T.arch', 'Archived Boat', 'Active', NULL, '2026-02-02T00:00:00Z', '{"lifecycle_status": "archived"}');
SELECT tests.results_eq(
  format($q$SELECT status, lifecycle_status, archived_at IS NOT NULL FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.arch')),
  $q$VALUES ('Sold', 'archived', true)$q$, 'inserting an archived vessel marks it Sold');

SELECT tests.seed_vessel('T', 'T.life', 'Life Boat', 'Active', NULL, '2026-02-03T00:00:00Z');
UPDATE public.vessels SET status = 'Sold' WHERE id = tests.vessel_id('T.life');
SELECT tests.results_eq(
  format($q$SELECT lifecycle_status, archived_at IS NOT NULL FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.life')),
  $q$VALUES ('archived', true)$q$, 'status -> Sold archives the vessel and stamps archived_at');
UPDATE public.vessels SET lifecycle_status = 'active' WHERE id = tests.vessel_id('T.life');
SELECT tests.results_eq(
  format($q$SELECT status, lifecycle_status, archived_at, archived_by, archive_reason FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.life')),
  $q$VALUES ('Active', 'active', NULL::timestamptz, NULL::uuid, NULL::text)$q$, 'lifecycle archived -> active puts a Sold vessel back to Active and clears the archive columns');
SELECT tests.seed_auth_user('T.admin');
UPDATE public.vessels SET lifecycle_status = 'archived', archived_by = tests.user_id('T.admin'), archive_reason = 'Sold to a new owner'
  WHERE id = tests.vessel_id('T.life');
SELECT tests.results_eq(
  format($q$SELECT status, archive_reason FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.life')),
  $q$VALUES ('Sold', 'Sold to a new owner')$q$, 'lifecycle -> archived marks the vessel Sold and keeps the given reason');
UPDATE public.vessels SET status = 'Active' WHERE id = tests.vessel_id('T.life');
SELECT tests.results_eq(
  format($q$SELECT lifecycle_status, archived_at IS NULL, archive_reason IS NULL FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.life')),
  $q$VALUES ('active', true, true)$q$, 'status Sold -> Active while archived makes it active again');
UPDATE public.vessels SET lifecycle_status = 'inactive' WHERE id = tests.vessel_id('T.life');
SELECT tests.results_eq(
  format($q$SELECT status, lifecycle_status FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.life')),
  $q$VALUES ('Active', 'inactive')$q$, 'inactive leaves the legacy status alone');
UPDATE public.vessels SET status = 'In Refit', lifecycle_status = 'archived' WHERE id = tests.vessel_id('T.life');
SELECT tests.results_eq(
  format($q$SELECT status, lifecycle_status FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.life')),
  $q$VALUES ('Sold', 'archived')$q$, 'archiving wins over another status in the same update (Sold <=> archived always holds)');
SELECT tests.is(
  (SELECT count(*) FROM public.vessels WHERE (status = 'Sold') IS DISTINCT FROM (lifecycle_status = 'archived') AND status IS NOT NULL),
  0::bigint, 'no vessel anywhere is Sold without being archived, or archived without being Sold');

-- ------------------------------------------------------------ CHECKs

SELECT tests.throws(format($q$UPDATE public.vessels SET lifecycle_status = 'gone' WHERE id = %L$q$, tests.vessel_id('T.dra2')), '23514', 'lifecycle_status outside active / inactive / archived is refused');
SELECT tests.throws(format($q$UPDATE public.vessels SET vessel_purpose = 'party' WHERE id = %L$q$, tests.vessel_id('T.dra2')), '23514', 'vessel_purpose outside operational / demo / training is refused');
SELECT tests.lives(format($q$UPDATE public.vessels SET vessel_purpose = 'demo', is_counted = false WHERE id = %L$q$, tests.vessel_id('T.dra2')), 'a demo vessel that is not counted');
SELECT tests.throws(format($q$UPDATE public.vessels SET archive_reason = repeat('x', 501) WHERE id = %L$q$, tests.vessel_id('T.dra2')), '23514', 'an archive reason over 500 characters is refused');
SELECT tests.throws(format($q$UPDATE public.vessels SET short_code = 'D' WHERE id = %L$q$, tests.vessel_id('T.dra2')), '23514', 'a one-character short code is refused');
SELECT tests.throws(format($q$UPDATE public.vessels SET short_code = 'd1' WHERE id = %L$q$, tests.vessel_id('T.dra2')), '23514', 'a lower-case short code is refused (stored upper case)');
SELECT tests.lives(format($q$UPDATE public.vessels SET short_code = 'D1' WHERE id = %L$q$, tests.vessel_id('T.dra2')), 'a valid short code');
SELECT tests.throws(format($q$UPDATE public.vessels SET short_code = 'D1' WHERE id = %L$q$, tests.vessel_id('T.dra3')), '23505', 'short codes are unique per company');
SELECT tests.throws(format($q$UPDATE public.vessels SET code = 'ÉAB' WHERE id = %L$q$, tests.vessel_id('T.dra2')), '23514', 'a non-ASCII code is refused');

-- ------------------------------------------------------------ privileges (rule 5)

SELECT tests.ok(
  (SELECT bool_and(p.proacl IS NOT NULL) FROM pg_proc AS p WHERE p.oid IN ('public.vessels_set_code()'::regprocedure, 'public.vessels_sync_lifecycle()'::regprocedure)),
  'the trigger functions have an explicit ACL (a NULL ACL would mean EXECUTE for PUBLIC)');
SELECT tests.is_empty(
  $q$SELECT p.oid::regprocedure, a.grantee FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(p.proacl) AS a
     WHERE p.oid IN ('public.vessels_set_code()'::regprocedure, 'public.vessels_sync_lifecycle()'::regprocedure)
       AND a.grantee <> p.proowner$q$,
  'the trigger functions are granted to nobody but their owner (not even PUBLIC)');
SELECT tests.results_eq(
  $q$SELECT p.oid::regprocedure::text, string_agg(a.grantee::regrole::text, ',' ORDER BY a.grantee::regrole::text)
     FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(p.proacl) AS a
     WHERE p.oid IN ('public.normalise_code_text(text)'::regprocedure, 'public.vessel_code_letters(text)'::regprocedure,
                     'public.vessel_code_candidates(text,integer)'::regprocedure, 'public.vessel_code_stored(text)'::regprocedure,
                     'public.vessel_codes_assign(jsonb)'::regprocedure, 'public.vessel_codes_for_company(uuid)'::regprocedure)
       AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
     GROUP BY 1$q$,
  $q$VALUES ('normalise_code_text(text)', 'authenticated,service_role'), ('vessel_code_letters(text)', 'service_role'),
            ('vessel_code_candidates(text,integer)', 'service_role'), ('vessel_code_stored(text)', 'authenticated,service_role'),
            ('vessel_codes_assign(jsonb)', 'service_role'), ('vessel_codes_for_company(uuid)', 'service_role')$q$,
  'EXECUTE grants are exactly the spec''s (normalise_code_text / vessel_code_stored: authenticated + service_role; the derivation helpers and vessel_codes_for_company: service_role only, D-231)');
SELECT tests.ok(
  (SELECT bool_and(p.proconfig @> ARRAY['search_path=public']) FROM pg_proc AS p
    WHERE p.oid IN ('public.vessel_codes_for_company(uuid)'::regprocedure, 'public.vessels_set_code()'::regprocedure, 'public.vessels_sync_lifecycle()'::regprocedure)),
  'the definers pin search_path = public');

SELECT tests.as_anon();
SELECT tests.throws($q$SELECT public.vessel_code_letters('Draak')$q$, '42501', 'anon cannot execute vessel_code_letters');
SELECT tests.throws($q$SELECT * FROM public.vessel_codes_for_company(tests.company_id('T'))$q$, '42501', 'anon cannot execute vessel_codes_for_company');
SELECT tests.seed_user('T', 'T.crew', 'crew');
SELECT tests.as_user(tests.user_id('T.crew'));
SELECT tests.is(public.vessel_code_stored(' dra '), 'DRA', 'a signed-in user can run vessel_code_stored (format_voyage_reference_text needs it)');
SELECT tests.is(public.normalise_code_text(' dra '), 'DRA', 'and normalise_code_text');
SELECT tests.throws($q$SELECT * FROM public.vessel_codes_for_company(tests.company_id('T'))$q$, '42501', 'authenticated cannot execute vessel_codes_for_company (it reads every vessel of a company)');
-- Review round 5 (vessel-code-helpers-cpu-grant, D-231): the derivation
-- helpers are service role / definers only; a signed-in call of
-- vessel_codes_assign could burn seconds of CPU (vfy-cpu/p1.sql).
SELECT tests.throws($q$SELECT count(*) FROM public.vessel_codes_assign((SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'name', 'A')) FROM generate_series(1, 400)))$q$,
                    '42501', 'a crew user cannot execute vessel_codes_assign (42501)');
SELECT tests.throws($q$SELECT public.vessel_code_letters('M/Y Draak')$q$, '42501', 'nor vessel_code_letters');
SELECT tests.throws($q$SELECT public.vessel_code_candidates('M/Y Draak', 12)$q$, '42501', 'nor vessel_code_candidates');
SELECT tests.as_service();
SELECT tests.ok((SELECT count(*) FROM public.vessel_codes_for_company(tests.company_id('T'))) >= 5, 'the service role can execute vessel_codes_for_company');
SELECT tests.is(public.vessel_code_letters('M/Y Draak'), 'DRAAK', 'and the derivation helpers');
SELECT tests.throws_like($q$SELECT count(*) FROM public.vessel_codes_assign((SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'name', 'Draak')) FROM generate_series(1, 2001)))$q$,
                         '22023', 'vessel_codes_too_many', 'vessel_codes_assign refuses more than 2000 vessels (22023 vessel_codes_too_many)');
SELECT tests.reset_role();

-- A fleet manager's vessel insert still gets a code: vessels_set_code is
-- SECURITY DEFINER, so it derives the code without the caller's grant.
SELECT tests.seed_user('T', 'T.fleet_manager', 'dpa');
SELECT tests.as_user(tests.user_id('T.fleet_manager'));
SELECT tests.lives(format($q$INSERT INTO public.vessels (id, company_id, name, status) VALUES (%L, %L, 'M/Y HALCYON', 'Active')$q$, tests.vessel_id('T.hal'), tests.company_id('T')),
                   'a fleet manager inserts a vessel under RLS');
SELECT tests.reset_role();
SELECT tests.is((SELECT code FROM public.vessels WHERE id = tests.vessel_id('T.hal')), 'HAL', 'and the new vessel gets its derived code (HAL)');

-- ------------------------------------------------------------ the archive stamp is the server's (review round 5, D-230)

-- actor-columns-client-forgeable: archiving under a JWT stamps the caller
-- and now(), whatever the client sends; a later update cannot rewrite the
-- stamp; without a JWT a given archived_at is kept.
SELECT tests.seed_auth_user('T.other');
SELECT tests.as_user(tests.user_id('T.fleet_manager'));
UPDATE public.vessels SET lifecycle_status = 'archived', archived_by = tests.user_id('T.other'), archived_at = '2001-01-01T00:00:00Z'
 WHERE id = tests.vessel_id('T.hal');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT lifecycle_status, status, archived_by, archived_at = now() FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.hal')),
  format($q$VALUES ('archived'::text, 'Sold'::text, %L::uuid, true)$q$, tests.user_id('T.fleet_manager')),
  'archiving under a JWT stamps the caller and now(), not the forged archived_by / archived_at');
SELECT tests.as_user(tests.user_id('T.fleet_manager'));
UPDATE public.vessels SET archived_by = tests.user_id('T.other'), archived_at = '2001-01-01T00:00:00Z', archive_reason = 'Sold to a new owner'
 WHERE id = tests.vessel_id('T.hal');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT archived_by, archived_at = now(), archive_reason FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.hal')),
  format($q$VALUES (%L::uuid, true, 'Sold to a new owner'::text)$q$, tests.user_id('T.fleet_manager')),
  'a later update of an archived vessel cannot rewrite archived_by / archived_at (the reason may change)');
-- Without a JWT (the service role, the backfill) a given archived_at is kept.
SELECT tests.seed_vessel('T', 'T.svc', 'Service Boat', 'Active', NULL, '2026-02-05T00:00:00Z');
UPDATE public.vessels SET lifecycle_status = 'archived', archived_at = '2020-01-01T00:00:00Z' WHERE id = tests.vessel_id('T.svc');
SELECT tests.results_eq(
  format($q$SELECT archived_at, archived_by FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.svc')),
  $q$VALUES ('2020-01-01T00:00:00Z'::timestamptz, NULL::uuid)$q$, 'without a JWT a given archived_at is kept');
UPDATE public.vessels SET archived_at = NULL, archived_by = NULL WHERE id = tests.vessel_id('T.dra2');
SELECT tests.lives(format($q$UPDATE public.vessels SET archived_at = '2020-01-01T00:00:00Z', archived_by = %L WHERE id = %L$q$, tests.user_id('T.other'), tests.vessel_id('T.dra2')),
                   'stamping a vessel that is not archived is accepted ...');
SELECT tests.results_eq(
  format($q$SELECT lifecycle_status, archived_at, archived_by FROM public.vessels WHERE id = %L$q$, tests.vessel_id('T.dra2')),
  $q$VALUES ('active'::text, NULL::timestamptz, NULL::uuid)$q$, '... but a vessel that is not archived keeps no archive stamp');
