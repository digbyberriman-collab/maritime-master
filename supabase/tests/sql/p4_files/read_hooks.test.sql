-- The read hooks of storage_path_allowed (20261123020300 in place;
-- platform-prep PP4; X5 PR-07, D-X5-17, D-382): the named hook list with
-- its scope; while fleet_document_file_readable(uuid, uuid, text) is
-- missing, a fleet document path stays closed to vessel crew (no fleet
-- reach) exactly as before and fleet reach still reads it; with a stub
-- predicate its answer is final for reads (the crew it answers for read the
-- file, through the records_select policy too; fleet reach no longer opens
-- what it refuses), it is asked about the whole name, and the vessel-folder
-- variant is refused by the scope; write mode never consults a hook; a
-- foreign company, an inactive caller, a malformed id and a NULL answer
-- stay closed; other paths are unchanged.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');

CREATE FUNCTION tests.fd_path(p_company uuid, p_doc uuid, p_no integer, p_entity_type text DEFAULT 'fleet_document', p_module text DEFAULT 'documents', p_vessel text DEFAULT 'fleet')
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT p_company::text || '/' || p_vessel || '/' || p_module || '/' || p_entity_type || '/' || p_doc::text || '/'
         || '00000000-0000-4000-8000-' || lpad(p_no::text, 12, '0') || '-manual.pdf'
$$;
GRANT EXECUTE ON FUNCTION tests.fd_path(uuid, uuid, integer, text, text, text) TO PUBLIC;

SELECT tests.company_id('A') AS ca, tests.company_id('B') AS cb, tests.vessel_id('A.dra') AS dra,
       tests.id('fleet_document:published') AS doc_pub, tests.id('fleet_document:other') AS doc_other, tests.id('fleet_document:B') AS doc_b \gset

-- A published fleet document file of A, another A document, and one of B (stored by the service).
INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
  ('records', tests.fd_path(:'ca', :'doc_pub', 1), NULL, '{"size": 10, "mimetype": "application/pdf"}'),
  ('records', tests.fd_path(:'ca', :'doc_other', 2), NULL, '{"size": 10, "mimetype": "application/pdf"}'),
  ('records', tests.fd_path(:'cb', :'doc_b', 3), NULL, '{"size": 10, "mimetype": "application/pdf"}');

-- ------------------------------------------------------------ the hook list

SELECT tests.results_eq(
  $q$SELECT module_key, entity_type, predicate, id_segment, effect, scope FROM public.storage_path_read_hooks()$q$,
  $q$VALUES ('documents'::text, 'fleet_document'::text, 'public.fleet_document_file_readable(uuid,uuid,text)'::text, 5, 'allow'::text, 'fleet'::text)$q$,
  'one read hook: fleet_document -> fleet_document_file_readable(user, id, name) on segment 5, effect allow, scope fleet');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.storage_path_read_hooks()', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.storage_path_read_hooks()', 'EXECUTE'),
                'the hook list is internal (no browser grant)');
SELECT tests.ok(position('storage_path_read_hooks' IN pg_get_functiondef('public.storage_path_allowed(text,text,boolean)'::regprocedure)) > 0,
                'storage_path_allowed reads the hook list');

-- ------------------------------------------------------------ predicate missing: unchanged

-- X5's real predicate (20261124040400) is in the build-out. This rolled-back file drops it, so
-- the sections below test the hook itself; fleet/documents_acks covers the real predicate.
SELECT tests.reset_role();
DROP FUNCTION IF EXISTS public.fleet_document_file_readable(uuid, uuid, text);
SELECT tests.ok(to_regprocedure('public.fleet_document_file_readable(uuid,uuid,text)') IS NULL AND to_regprocedure('public.fleet_document_file_readable(uuid,uuid)') IS NULL,
                'setup: the fleet document predicate is not in the database (nor the first, per-document form)');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1), false), 'no predicate: vessel crew cannot read a fleet document path (as before)');
SELECT tests.is_empty($q$SELECT name FROM storage.objects WHERE bucket_id = 'records'$q$, 'no predicate: vessel crew read no fleet object through the policy');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1), false), 'control: the fleet manager (fleet reach) reads it');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1, 'fleet_document', 'documents', :'dra'), false),
                'no predicate: the vessel-folder variant of a fleet document path is refused by the hook''s scope');

-- ------------------------------------------------------------ with a stub predicate (rolled back with the file)

SELECT tests.reset_role();
-- The published document is readable by DRAAK crew; nothing else is.
-- The stub is asked about the whole name: it answers for file 1 only.
CREATE FUNCTION public.fleet_document_file_readable(p_user_id uuid, p_document_id uuid, p_name text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_document_id = tests.id('fleet_document:published') AND p_user_id = tests.user_id('A.crew_dra')
         AND p_name = tests.fd_path(tests.company_id('A'), tests.id('fleet_document:published'), 1)
$$;
-- Service only, as X5 builds it: storage_path_allowed is a definer and needs no caller grant.
REVOKE ALL ON FUNCTION public.fleet_document_file_readable(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.ok(public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1), false), 'with the predicate: DRAAK crew read the published fleet document');
SELECT tests.results_eq($q$SELECT name FROM storage.objects WHERE bucket_id = 'records'$q$,
                        format($q$VALUES (%L::text)$q$, tests.fd_path(:'ca', :'doc_pub', 1)),
                        'with the predicate: through records_select they read exactly that file');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_other', 2), false), 'with the predicate: not a document it refuses');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 11), false),
                'with the predicate: nor another file of the same document (the predicate is asked about the name)');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1, 'fleet_document', 'documents', :'dra'), false),
                'with the predicate: the vessel-folder variant of the readable file is refused (scope fleet)');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 4), true), 'write mode never consults a hook: no upload to the fleet path');
SELECT tests.throws(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('records', %L, auth.uid())$q$, tests.fd_path(:'ca', :'doc_pub', 5)), '42501',
                    'write mode: the upload is refused by records_insert');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 6, 'policy'), false),
                'another entity type under documents has no hook (fleet reach still needed)');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 7, 'fleet_document', 'safety'), false),
                'the same entity type under another module has no hook');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'cb', :'doc_b', 3), false), 'another company''s fleet document stays closed');
SELECT tests.ok(NOT public.storage_path_allowed('documents', tests.fd_path(:'ca', :'doc_pub', 1), false), 'another bucket stays closed');
SELECT tests.ok(public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 8, 'incident', 'safety', :'dra'), false),
                'control: their own vessel''s paths are unchanged');

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1), false), 'with the predicate: crew it does not answer for still cannot read');
SELECT tests.is_empty($q$SELECT name FROM storage.objects WHERE bucket_id = 'records'$q$, 'with the predicate: and read nothing through the policy');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_other', 2), false),
                'with the predicate: its answer is final, so fleet reach no longer opens a fleet document file it refuses');
SELECT tests.ok(public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 8, 'incident', 'safety'), false),
                'control: fleet reach still opens fleet paths without a hook');

-- A predicate that says yes to everything never opens another company, an inactive caller or a malformed path;
-- a NULL answer is a no.
SELECT tests.reset_role();
CREATE OR REPLACE FUNCTION public.fleet_document_file_readable(p_user_id uuid, p_document_id uuid, p_name text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.ok(public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_other', 2), false), 'a permissive predicate: any active member of A reads A''s fleet documents');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'cb', :'doc_b', 3), false), 'a permissive predicate: never company B''s');
SELECT tests.ok(NOT public.storage_path_allowed('records', replace(tests.fd_path(:'ca', :'doc_pub', 9), :'doc_pub', upper(:'doc_pub')), false),
                'a permissive predicate: an upper-case document id is malformed');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 9) || '/x', false), 'a permissive predicate: seven segments are malformed');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1), false), 'a permissive predicate: a disabled member reads nothing');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1), false), 'a permissive predicate: company B reads nothing of A');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM storage.objects WHERE bucket_id = 'records'$q$, 'anon reads nothing');

SELECT tests.reset_role();
CREATE OR REPLACE FUNCTION public.fleet_document_file_readable(p_user_id uuid, p_document_id uuid, p_name text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT NULL::boolean $$;
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.fd_path(:'ca', :'doc_pub', 1), false), 'a NULL answer is a no');
