-- Crew-document storage scoping (20261124000100; X1 PR-X1-F; gap/08 UP1;
-- D-X1-18): the documents bucket (private, 50 MB, the UP1 list of
-- upload-policy.json); the four legacy policies replaced; the prefix
-- <company>/crew/<profile_id>/documents/ closed while X1's predicates are
-- missing, open per the predicates once they exist (stubs here), never to
-- a foreign company, a foreign profile, an inactive caller or a malformed
-- name; every other prefix (the company files, the legacy crew HR kinds,
-- recruitment) unchanged for an active member and closed to other
-- companies and anon; the helpers' grants.

\set fixture `cat supabase/tests/fixtures/upload-policy.json`

SELECT tests.seed_two_tenants();
SELECT tests.seed_profile('A', 'A.deckhand');   -- a crew member with no login
SELECT tests.seed_profile('A', 'A.steward');
SELECT tests.seed_profile('B', 'B.deckhand');

-- <company>/crew/<profile>/documents/<file uuid>-<name>
CREATE FUNCTION tests.crew_doc(p_company text, p_profile text, p_no integer, p_name text DEFAULT 'passport.pdf')
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT tests.company_id(p_company)::text || '/crew/' || tests.profile_id(p_profile)::text || '/documents/'
         || '00000000-0000-4000-8000-' || lpad(p_no::text, 12, '0') || '-' || p_name
$$;
GRANT EXECUTE ON FUNCTION tests.crew_doc(text, text, integer, text) TO PUBLIC;

SELECT tests.company_id('A') AS ca, tests.company_id('B') AS cb,
       tests.profile_id('A.deckhand') AS deck, tests.profile_id('A.steward') AS stew, tests.profile_id('B.deckhand') AS bdeck,
       tests.user_id('A.crew_hyd') AS crew_user \gset

-- Objects stored by the service before the tests (as the storage API's service role would).
INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
  ('documents', tests.crew_doc('A', 'A.deckhand', 1), NULL, '{"size": 10, "mimetype": "application/pdf"}'),
  ('documents', tests.crew_doc('A', 'A.steward', 2), NULL, '{"size": 10, "mimetype": "application/pdf"}'),
  ('documents', tests.crew_doc('B', 'B.deckhand', 3), NULL, '{"size": 10, "mimetype": "application/pdf"}'),
  ('documents', :'cb' || '/1700000000000.pdf', NULL, '{"size": 10, "mimetype": "application/pdf"}');

-- ------------------------------------------------------------ the bucket and the policies

SELECT tests.results_eq(
  $q$SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'documents'$q$,
  format($q$SELECT 'documents'::text, false, %s::bigint, ARRAY(SELECT jsonb_array_elements_text(%L::jsonb -> 'mimeTypes'))$q$,
         (:'fixture'::jsonb ->> 'maxBytes'), :'fixture'),
  'documents bucket: private, 50 MB, the UP1 MIME list of upload-policy.json in order');
SELECT tests.is_empty(
  $q$SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('Users can view documents in their company', 'Users can upload documents to their company',
                          'Users can update documents in their company', 'Users can delete documents in their company')$q$,
  'the four legacy documents-bucket policies are gone from storage.objects');
SELECT tests.results_eq(
  $q$SELECT policyname::text, cmd::text, roles::text FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'documents\_bucket\_%'$q$,
  $q$VALUES ('documents_bucket_delete', 'DELETE', '{authenticated}'), ('documents_bucket_insert', 'INSERT', '{authenticated}'),
            ('documents_bucket_select', 'SELECT', '{authenticated}'), ('documents_bucket_update', 'UPDATE', '{authenticated}')$q$,
  'four documents_bucket_ policies, one per command, for authenticated');
SELECT tests.is((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname LIKE '%documents in their company'), 4::bigint,
  'the same legacy names on public.documents (another table) are untouched');

-- ------------------------------------------------------------ path helpers

SELECT tests.ok(public.storage_crew_document_path(tests.crew_doc('A', 'A.deckhand', 9)), 'a crew document path is under the prefix');
SELECT tests.ok(public.storage_crew_document_path(:'ca' || '/crew/x/documents'), 'a malformed name under the prefix still counts as the prefix (denied by the gate)');
SELECT tests.ok(NOT public.storage_crew_document_path(:'ca' || '/crew/' || :'crew_user' || '/' || k || '/1700000000000-x.pdf'),
                format('legacy crew HR kind %s is not under the prefix', k))
FROM unnest(ARRAY['certificates', 'attachments', 'contracts', 'next-of-kin', 'evaluations', 'disciplinary', 'payslips', 'right-to-work', 'recruitment', 'onboarding']) AS k;
SELECT tests.ok(NOT public.storage_crew_document_path(:'ca' || '/1700000000000.pdf') AND NOT public.storage_crew_document_path('form-templates/1.pdf')
                AND NOT public.storage_crew_document_path(NULL), 'company files, form templates and NULL are not under the prefix');
SELECT tests.is(public.storage_object_company(:'ca' || '/x.pdf'), :'ca'::uuid, 'storage_object_company: the first folder');
SELECT tests.ok(public.storage_object_company('x.pdf') IS NULL AND public.storage_object_company('form-templates/x.pdf') IS NULL
                AND public.storage_object_company(upper(:'ca') || '/x.pdf') IS NULL AND public.storage_object_company(NULL) IS NULL,
                'storage_object_company: NULL without a folder, for a non-uuid or upper-case first folder, and for NULL');

-- ------------------------------------------------------------ without X1's predicates: the prefix is closed

-- X1's real predicates (20261124060400, edited by 060500) are in the build-out. This rolled-back
-- file drops them, so the sections below test the gate itself: closed without a predicate, open
-- only per a predicate's answer. X1's crew/document_catalogue and document_verification tests
-- cover the real predicates.
SELECT tests.reset_role();
DROP FUNCTION IF EXISTS public.crew_document_file_readable(uuid, uuid);
DROP FUNCTION IF EXISTS public.crew_document_file_writable(uuid, uuid);
SELECT tests.ok(to_regprocedure('public.crew_document_file_readable(uuid,uuid)') IS NULL AND to_regprocedure('public.crew_document_file_writable(uuid,uuid)') IS NULL,
                'setup: X1''s predicates are not in the database');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), false)
                AND NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), true),
                'no predicate: the gate answers false for read and write, even for the DPA');
SELECT tests.is_empty(format($q$SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND name = %L$q$, tests.crew_doc('A', 'A.deckhand', 1)),
                      'no predicate: the DPA cannot read a crew document of their company');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.crew_doc('A', 'A.deckhand', 10)),
                    'no predicate: the DPA cannot upload a crew document');
SELECT tests.denied(format($q$UPDATE storage.objects SET metadata = '{}' WHERE bucket_id = 'documents' AND name = %L$q$, tests.crew_doc('A', 'A.deckhand', 1)),
                    'no predicate: the DPA cannot overwrite a crew document');
SELECT tests.denied(format($q$DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name = %L$q$, tests.crew_doc('A', 'A.deckhand', 1)),
                    'no predicate: the DPA cannot delete a crew document');

-- ------------------------------------------------------------ every other prefix is unchanged

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.lives(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, :'ca' || '/1700000000001.pdf'),
                   'a crew member uploads a company file (<company>/<file>, the certificates and documents writers)');
SELECT tests.lives(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, :'ca' || '/recruitment/' || :'deck' || '/1700000000001-cv.pdf'),
                   'a recruitment CV path is a company file');
SELECT tests.lives(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$,
                          :'ca' || '/crew/' || :'crew_user' || '/' || k || '/1700000000001-' || k || '.pdf'),
                   format('legacy crew HR kind %s: a company member uploads (unchanged)', k))
FROM unnest(ARRAY['certificates', 'attachments', 'contracts', 'next-of-kin', 'evaluations', 'disciplinary', 'payslips', 'right-to-work', 'recruitment', 'onboarding']) AS k;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE :'ca' || '/crew/' || :'crew_user' || '/%'), 10::bigint,
                'another member of the company reads every legacy crew HR file (unchanged)');
WITH u AS (UPDATE storage.objects SET metadata = '{"size": 11}' WHERE bucket_id = 'documents' AND name = :'ca' || '/1700000000001.pdf' RETURNING 1)
SELECT tests.is(count(*), 1::bigint,
                'another member of the company updates a company file (unchanged)') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name = :'ca' || '/crew/' || :'crew_user' || '/payslips/1700000000001-payslips.pdf' RETURNING 1)
SELECT tests.is(count(*), 1::bigint,
                'another member of the company deletes a legacy crew HR file (unchanged: the HR-prefix exposure is a separate platform item)') FROM d;
SELECT tests.is_empty(format($q$SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE %L$q$, :'cb' || '/%'), 'company A reads nothing of company B');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, :'cb' || '/1700000000002.pdf'),
                    'company A cannot upload under company B');
SELECT tests.denied($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', 'form-templates/1700000000002.pdf', auth.uid())$q$,
                    'a name without a company folder is refused (as before: no profile company matched it)');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, upper(:'ca') || '/1700000000002.pdf'),
                    'an upper-case company folder is refused (as before: it never equalled company_id::text)');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'documents' AND name = :'cb' || '/1700000000000.pdf'), 1::bigint, 'company B reads its own company file');
SELECT tests.is_empty(format($q$SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE %L$q$, :'ca' || '/%'), 'company B reads nothing of company A');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is_empty(format($q$SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE %L$q$, :'ca' || '/%'),
                      'a disabled member reads nothing (as after 20261123010000: they read no profile row)');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, :'ca' || '/1700000000003.pdf'),
                    'a disabled member uploads nothing');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM storage.objects WHERE bucket_id = 'documents'$q$, 'anon reads nothing in the documents bucket');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', %L)$q$, :'ca' || '/1700000000004.pdf'), 'anon uploads nothing');

-- ------------------------------------------------------------ with X1's predicates (stubs, rolled back with the file)

SELECT tests.reset_role();
-- Readable: the DPA and the Master, for A.deckhand only. Writable: the DPA only.
CREATE FUNCTION public.crew_document_file_readable(p_user uuid, p_profile uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_profile = tests.profile_id('A.deckhand') AND p_user IN (tests.user_id('A.fleet_manager'), tests.user_id('A.master_dra'))
$$;
CREATE FUNCTION public.crew_document_file_writable(p_user uuid, p_profile uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_profile = tests.profile_id('A.deckhand') AND p_user = tests.user_id('A.fleet_manager')
$$;
-- The gate is a definer: the caller needs no EXECUTE on X1's (service-only) predicates.
REVOKE ALL ON FUNCTION public.crew_document_file_readable(uuid, uuid), public.crew_document_file_writable(uuid, uuid) FROM PUBLIC, anon, authenticated;

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'documents' AND name = tests.crew_doc('A', 'A.deckhand', 1)), 1::bigint,
                'with the predicates: the DPA reads A.deckhand''s document');
SELECT tests.is_empty(format($q$SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND name = %L$q$, tests.crew_doc('A', 'A.steward', 2)),
                      'with the predicates: the DPA does not read a document the predicate refuses');
SELECT tests.lives(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.crew_doc('A', 'A.deckhand', 11)),
                   'with the predicates: the DPA uploads a crew document for A.deckhand (no login, keyed on the profile)');
WITH u AS (UPDATE storage.objects SET metadata = '{"size": 12}' WHERE bucket_id = 'documents' AND name = tests.crew_doc('A', 'A.deckhand', 11) RETURNING 1)
SELECT tests.is(count(*), 1::bigint,
                'with the predicates: the DPA updates it') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name = tests.crew_doc('A', 'A.deckhand', 11) RETURNING 1)
SELECT tests.is(count(*), 1::bigint,
                'with the predicates: the DPA deletes it') FROM d;
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.crew_doc('A', 'A.steward', 12)),
                    'with the predicates: the DPA cannot upload where the write predicate refuses');

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'documents' AND name = tests.crew_doc('A', 'A.deckhand', 1)), 1::bigint,
                'with the predicates: the Master reads (read predicate)');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.crew_doc('A', 'A.deckhand', 13)),
                    'with the predicates: the Master cannot upload (write predicate refuses)');
SELECT tests.denied(format($q$DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name = %L$q$, tests.crew_doc('A', 'A.deckhand', 1)),
                    'with the predicates: the Master cannot delete');

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is_empty(format($q$SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE %L$q$, :'ca' || '/crew/%/documents/%'),
                      'with the predicates: another crew member reads no crew document');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.crew_doc('A', 'A.deckhand', 14)),
                    'with the predicates: another crew member cannot upload one');

-- A predicate that says yes to everything still never opens a foreign company, a foreign profile,
-- an inactive caller or a malformed name; a NULL answer is a no.
SELECT tests.reset_role();
CREATE OR REPLACE FUNCTION public.crew_document_file_readable(p_user uuid, p_profile uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.crew_document_file_writable(p_user uuid, p_profile uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT NULL::boolean $$;

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is_empty(format($q$SELECT name FROM storage.objects WHERE bucket_id = 'documents' AND name = %L$q$, tests.crew_doc('B', 'B.deckhand', 3)),
                      'a permissive predicate: company A never reads company B''s crew documents');
SELECT tests.ok(NOT public.storage_crew_document_allowed(:'ca' || '/crew/' || :'bdeck' || '/documents/00000000-0000-4000-8000-000000000020-a.pdf', false),
                'a permissive predicate: a profile of another company under my company is refused');
SELECT tests.ok(NOT public.storage_crew_document_allowed(:'ca' || '/crew/' || tests.id('profile:ghost')::text || '/documents/00000000-0000-4000-8000-000000000021-a.pdf', false),
                'a permissive predicate: an unknown profile is refused');
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 22), true), 'a NULL answer from the write predicate is a no');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.crew_doc('A', 'A.deckhand', 23)),
                    'a NULL answer: the upload is refused');
SELECT tests.ok(public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), false), 'control: a well-formed name of my company is read');
SELECT tests.ok(NOT public.storage_crew_document_allowed(n, false), format('a permissive predicate: malformed name refused (%s)', why))
FROM (VALUES
  (:'ca' || '/crew/' || :'deck' || '/documents', 'four segments'),
  (tests.crew_doc('A', 'A.deckhand', 24) || '/extra', 'six segments'),
  (:'ca' || '/crew/' || :'deck' || '/documents/passport.pdf', 'no uuid before the name'),
  (:'ca' || '/crew/' || :'deck' || '/documents/00000000-0000-4000-8000-00000000002A-a.pdf', 'upper-case file uuid'),
  (upper(:'ca') || '/crew/' || :'deck' || '/documents/00000000-0000-4000-8000-000000000025-a.pdf', 'upper-case company uuid'),
  (:'ca' || '/crew/' || :'deck' || '/documents/00000000-0000-4000-8000-000000000026-.hidden', 'name starts with a dot'),
  (:'ca' || '/crew/' || :'deck' || '/documents/00000000-0000-4000-8000-000000000027-a..pdf', '".." in the name'),
  (:'ca' || '/crew/' || :'deck' || '/documents/00000000-0000-4000-8000-000000000028-a b.pdf', 'space in the name'),
  (:'ca' || '/crew/not-a-uuid/documents/00000000-0000-4000-8000-000000000029-a.pdf', 'profile is not a uuid'),
  (NULL::text, 'NULL')
) AS t(n, why);
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), false), 'a permissive predicate: a disabled member is refused');
SELECT tests.as_anon();
SELECT tests.ok(NOT has_function_privilege('anon', 'public.storage_crew_document_allowed(text,boolean)', 'EXECUTE'), 'anon cannot call the gate');

-- ------------------------------------------------------------ grants and definer settings (rule 5)

SELECT tests.reset_role();
SELECT tests.ok(has_function_privilege('authenticated', format('public.%s', f), 'EXECUTE') AND has_function_privilege('service_role', format('public.%s', f), 'EXECUTE')
                AND NOT has_function_privilege('anon', format('public.%s', f), 'EXECUTE'),
                format('%s: authenticated and service_role execute, anon does not', f))
FROM unnest(ARRAY['storage_crew_document_allowed(text,boolean)', 'storage_crew_document_path(text)', 'storage_object_company(text)']) AS f;
SELECT tests.ok(p.prosecdef AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%')
                AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) AS a WHERE a.grantee = 0),
                'the gate is SECURITY DEFINER with a search_path, and PUBLIC holds no EXECUTE')
FROM pg_proc AS p WHERE p.oid = 'public.storage_crew_document_allowed(text,boolean)'::regprocedure;
SELECT tests.ok(NOT p.prosecdef, format('%s is not a definer (pure)', p.oid::regprocedure))
FROM pg_proc AS p WHERE p.oid IN ('public.storage_crew_document_path(text)'::regprocedure, 'public.storage_object_company(text)'::regprocedure);
