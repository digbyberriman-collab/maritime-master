-- Crew-file storage scoping (20261124000100; X1 PR-X1-F; gap/08 UP1;
-- D-X1-18, D-373): the documents bucket (private, 50 MB, the UP1 list of
-- upload-policy.json); the four legacy policies replaced; everything under
-- <company>/crew/ is personal data behind the action-aware gate: the
-- documents, certificates and attachments kinds closed while X1's
-- predicates are missing, open per the predicates once they exist (stubs
-- here); the HR kinds per the D-373 table (the subject reads their own
-- payslip and disciplinary file but never replaces or deletes them, HR
-- viewers read, HR editors write, another crew member reads, writes and
-- deletes nothing, paths keyed on a login id and on a profile id both
-- resolve); never a foreign company, a foreign or unknown profile, an
-- unknown kind, a '..' name, an inactive caller or a malformed name; every
-- other prefix (the company files, recruitment CVs) unchanged for an
-- active member and closed to other companies and anon; the helpers'
-- grants.

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
SELECT tests.ok(public.storage_crew_document_path(:'ca' || '/crew/' || :'crew_user' || '/' || k || '/1700000000000-x.pdf'),
                format('legacy crew HR kind %s is under the crew prefix too (D-373: crew/ is personal data)', k))
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
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), 'read')
                AND NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), 'insert')
                AND NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), 'update')
                AND NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), 'delete'),
                'no predicate: the gate answers false for every action, even for the DPA');
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
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
WITH u AS (UPDATE storage.objects SET metadata = '{"size": 11}' WHERE bucket_id = 'documents' AND name = :'ca' || '/1700000000001.pdf' RETURNING 1)
SELECT tests.is(count(*), 1::bigint,
                'another member of the company updates a company file (unchanged)') FROM u;
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

-- ------------------------------------------------------------ the HR kinds under crew/ (D-373)

-- A subject with a login (A.sub), another crew member (A.crew_hyd), an HR
-- viewer, an HR editor, a payroll viewer and a reviewer of one of the
-- subject's reviews. Objects stored by the service under the subject's
-- login id (the legacy writers) and one payslip under the profile id
-- (usePayroll writes crew_user_id ?? profile_id).
SELECT tests.reset_role();
SELECT tests.seed_user('A', 'A.sub', 'crew');
SELECT tests.seed_assignment('A.sub', 'A.dra', true, 'Deckhand');
SELECT tests.seed_user('A', 'A.hrv', 'crew');
SELECT tests.seed_user('A', 'A.hre', 'crew');
SELECT tests.seed_user('A', 'A.payv', 'crew');
SELECT tests.seed_user('A', 'A.reviewer', 'crew');
SELECT tests.seed_assignment('A.reviewer', 'A.dra', true, 'Bosun');
SELECT tests.seed_role('x373_hr_view', 'fleet');
SELECT tests.seed_role('x373_hr_edit', 'fleet');
SELECT tests.seed_role('x373_pay_view', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.m, x.p::public.permission_level, 'fleet'
FROM (VALUES ('x373_hr_view', 'hr', 'view'), ('x373_hr_edit', 'hr', 'edit'), ('x373_pay_view', 'finance', 'view')) AS x(r, m, p)
JOIN public.roles AS r ON r.name = x.r;
SELECT tests.seed_rbac_role('A.hrv', 'x373_hr_view');
SELECT tests.seed_rbac_role('A.hre', 'x373_hr_edit');
SELECT tests.seed_rbac_role('A.payv', 'x373_pay_view');
INSERT INTO public.performance_reviews (id, company_id, profile_id, reviewer_profile_id)
VALUES (tests.id('review:x373'), tests.company_id('A'), tests.profile_id('A.sub'), tests.profile_id('A.reviewer'));
SELECT tests.ok(public.hr_can_view(tests.user_id('A.hrv')) AND NOT public.hr_can_edit(tests.user_id('A.hrv'))
                AND public.hr_can_edit(tests.user_id('A.hre'))
                AND public.payroll_can_view(tests.user_id('A.payv')) AND NOT public.hr_can_view(tests.user_id('A.payv'))
                AND NOT public.hr_can_view(tests.user_id('A.crew_hyd')) AND NOT public.hr_can_view(tests.user_id('A.sub'))
                AND NOT public.hr_can_view(tests.user_id('A.reviewer')),
                'HR kinds world: an HR viewer, an HR editor, a payroll viewer; the crew members, the subject and the reviewer hold no HR right');
CREATE FUNCTION tests.hr_path(p_key text, p_kind text, p_file text DEFAULT '1700000000000-file.pdf', p_by_profile boolean DEFAULT false)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT tests.company_id('A')::text || '/crew/' || CASE WHEN p_by_profile THEN tests.profile_id(p_key) ELSE tests.user_id(p_key) END::text
         || '/' || p_kind || '/' || p_file
$$;
GRANT EXECUTE ON FUNCTION tests.hr_path(text, text, text, boolean) TO PUBLIC;
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'documents', tests.hr_path('A.sub', k), NULL, '{"size": 10, "mimetype": "application/pdf"}'
FROM unnest(ARRAY['certificates', 'attachments', 'contracts', 'next-of-kin', 'evaluations', 'disciplinary', 'payslips', 'right-to-work', 'recruitment', 'onboarding']) AS k;
INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
  ('documents', tests.hr_path('A.sub', 'payslips', '1700000000009-by-profile.pdf', true), NULL, '{"size": 10, "mimetype": "application/pdf"}');
CREATE TEMP TABLE hr_kind (kind text PRIMARY KEY) ON COMMIT DROP;
GRANT SELECT ON hr_kind TO PUBLIC;
INSERT INTO hr_kind SELECT unnest(ARRAY['certificates', 'attachments', 'contracts', 'next-of-kin', 'evaluations', 'disciplinary', 'payslips', 'right-to-work', 'recruitment', 'onboarding']);
CREATE FUNCTION tests.sub_files() RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*) FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE tests.company_id('A')::text || '/crew/%' AND (name LIKE '%' || tests.user_id('A.sub')::text || '/%' OR name LIKE '%' || tests.profile_id('A.sub')::text || '/%')
$$;
GRANT EXECUTE ON FUNCTION tests.sub_files() TO PUBLIC;

-- Another crew member of the company: nothing, for every kind (the exposure the review found).
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is(tests.sub_files(), 0::bigint, 'another crew member reads none of a peer''s crew files, of any kind');
WITH u AS (UPDATE storage.objects SET metadata = '{"size": 99}' WHERE bucket_id = 'documents' AND name LIKE :'ca' || '/crew/%' RETURNING 1)
SELECT tests.is(count(*), 0::bigint, 'another crew member overwrites none of them') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE :'ca' || '/crew/%' RETURNING 1)
SELECT tests.is(count(*), 0::bigint, 'another crew member deletes none of them') FROM d;
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.hr_path('A.sub', k.kind, '1700000000100-x.pdf')),
                    format('another crew member uploads nothing under a peer''s %s', k.kind))
FROM hr_kind AS k ORDER BY k.kind;
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.hr_path('A.sub', k.kind), a), format('the gate: a peer may not %s a %s file', a, k.kind))
FROM hr_kind AS k CROSS JOIN unnest(ARRAY['read', 'insert', 'update', 'delete']) AS a ORDER BY k.kind, a;

-- The subject: reads their own contract, payslip (by login id and by
-- profile id), disciplinary, evaluation, right-to-work, next-of-kin and
-- onboarding files (never recruitment; certificates and attachments are
-- X1's predicates, missing here); never replaces or deletes them; adds
-- their own right-to-work, next-of-kin and onboarding evidence.
SELECT tests.as_user(tests.user_id('A.sub'));
SELECT tests.results_eq(
  format($q$SELECT split_part(name, '/', 4) FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE %L ORDER BY 1$q$, :'ca' || '/crew/%'),
  $q$VALUES ('contracts'), ('disciplinary'), ('evaluations'), ('next-of-kin'), ('onboarding'), ('payslips'), ('payslips'), ('right-to-work')$q$,
  'the subject reads their own HR files (the payslip under the login id and under the profile id), not recruitment, nor X1 kinds without the predicate');
WITH u AS (UPDATE storage.objects SET metadata = '{"size": 99}' WHERE bucket_id = 'documents' AND name LIKE :'ca' || '/crew/%' RETURNING 1)
SELECT tests.is(count(*), 0::bigint, 'the subject replaces none of their HR files') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE :'ca' || '/crew/%' RETURNING 1)
SELECT tests.is(count(*), 0::bigint, 'the subject deletes none of them (payslip, disciplinary included)') FROM d;
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.hr_path('A.sub', k, '1700000000101-x.pdf')),
                    format('the subject cannot upload a %s file', k))
FROM unnest(ARRAY['contracts', 'payslips', 'disciplinary', 'evaluations', 'recruitment']) AS k ORDER BY k;
SELECT tests.lives(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.hr_path('A.sub', k, '1700000000102-mine.pdf')),
                   format('the subject adds their own %s file (a new object)', k))
FROM unnest(ARRAY['right-to-work', 'next-of-kin', 'onboarding']) AS k ORDER BY k;
WITH u AS (UPDATE storage.objects SET metadata = '{"size": 98}' WHERE bucket_id = 'documents' AND name = tests.hr_path('A.sub', 'right-to-work', '1700000000102-mine.pdf') RETURNING 1)
SELECT tests.is(count(*), 0::bigint, 'but cannot replace it afterwards (HR editors only)') FROM u;

-- HR viewer: reads every HR kind, writes nothing. Payroll viewer: payslips only. Reviewer: evaluations only.
SELECT tests.as_user(tests.user_id('A.hrv'));
SELECT tests.is(tests.sub_files(), 12::bigint, 'an HR viewer reads the subject''s HR files (every kind but the X1 ones; the subject''s three new uploads included)');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.hr_path('A.sub', 'payslips', '1700000000103-x.pdf')),
                    'an HR viewer uploads nothing');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE :'ca' || '/crew/%' RETURNING 1)
SELECT tests.is(count(*), 0::bigint, 'an HR viewer deletes nothing') FROM d;
SELECT tests.as_user(tests.user_id('A.payv'));
SELECT tests.results_eq(
  format($q$SELECT split_part(name, '/', 4) FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE %L ORDER BY 1$q$, :'ca' || '/crew/%'),
  $q$VALUES ('payslips'), ('payslips')$q$, 'a payroll viewer reads payslips only');
SELECT tests.as_user(tests.user_id('A.reviewer'));
SELECT tests.results_eq(
  format($q$SELECT split_part(name, '/', 4) FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE %L ORDER BY 1$q$, :'ca' || '/crew/%'),
  $q$VALUES ('evaluations')$q$, 'the reviewer of one of the subject''s reviews reads the evaluation file only');
SELECT tests.lives(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.hr_path('A.sub', 'evaluations', '1700000000104-review.pdf')),
                   'and uploads a review document (the performance_reviews write rule)');

-- HR editor: writes, replaces and deletes every HR kind; never an unknown kind, a '..' name or a foreign profile.
SELECT tests.as_user(tests.user_id('A.hre'));
SELECT tests.lives(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.hr_path('A.sub', k, '1700000000105-hr.pdf')),
                   format('an HR editor uploads a %s file', k))
FROM unnest(ARRAY['contracts', 'payslips', 'disciplinary', 'evaluations', 'right-to-work', 'next-of-kin', 'onboarding', 'recruitment']) AS k ORDER BY k;
SELECT tests.lives(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.hr_path('A.sub', 'payslips', '1700000000106-hr.pdf', true)),
                   'an HR editor uploads a payslip under the profile id (a person without a login)');
WITH u AS (UPDATE storage.objects SET metadata = '{"size": 12}' WHERE bucket_id = 'documents' AND name = tests.hr_path('A.sub', 'payslips') RETURNING 1)
SELECT tests.is(count(*), 1::bigint, 'an HR editor replaces a payslip') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name = tests.hr_path('A.sub', 'disciplinary') RETURNING 1)
SELECT tests.is(count(*), 1::bigint, 'an HR editor deletes a disciplinary file') FROM d;
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.hr_path('A.sub', 'misc', '1700000000107-x.pdf')),
                    'an unknown kind is refused, even for an HR editor');
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.hr_path('A.sub', 'payslips', '..1700000000108-x.pdf'), 'insert')
                AND NOT public.storage_crew_document_allowed(:'ca' || '/crew/' || tests.user_id('A.sub')::text || '/payslips/../x.pdf', 'read'),
                'a name with .. is refused');
SELECT tests.ok(NOT public.storage_crew_document_allowed(:'ca' || '/crew/' || tests.profile_id('B.deckhand')::text || '/payslips/1700000000109-x.pdf', 'insert')
                AND NOT public.storage_crew_document_allowed(:'ca' || '/crew/' || tests.user_id('B.admin')::text || '/payslips/1700000000109-x.pdf', 'read')
                AND NOT public.storage_crew_document_allowed(:'ca' || '/crew/' || tests.id('profile:nobody')::text || '/payslips/1700000000109-x.pdf', 'read'),
                'a profile or login of another company under my company, and an unknown id, are refused');
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.hr_path('A.sub', 'payslips'), 'approve') AND NOT public.storage_crew_document_allowed(tests.hr_path('A.sub', 'payslips'), NULL),
                'an unknown action is refused');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is(tests.sub_files(), 0::bigint, 'another tenant''s administrator reads none of them');
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.hr_path('A.sub', 'payslips'), 'read'), 'and the gate says no');
SELECT tests.reset_role();

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

-- The legacy certificates and attachments kinds follow X1's predicates too (D-373): the
-- Master (a legacy HR editor) reads A.deckhand's certificate (the stub says yes) and not
-- A.sub's (the stub says no), whatever the HR rights.
SELECT tests.reset_role();
INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
  ('documents', :'ca' || '/crew/' || :'deck' || '/certificates/1700000000200-stcw.pdf', NULL, '{"size": 10, "mimetype": "application/pdf"}');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.ok(public.hr_can_edit(auth.uid()), 'setup: the Master is a legacy HR editor');
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE :'ca' || '/crew/%/certificates/%'), 1::bigint,
                'with the predicates: the Master reads certificates only through X1''s predicate (A.deckhand''s, not A.sub''s)');
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.hr_path('A.sub', 'certificates'), 'read') AND NOT public.storage_crew_document_allowed(tests.hr_path('A.sub', 'attachments'), 'insert'),
                'with the predicates: the HR rights do not open the X1 kinds');
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'documents' AND name = tests.hr_path('A.sub', 'payslips')), 1::bigint,
                'while the HR kinds follow the HR rights (the Master reads the payslip)');
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
SELECT tests.ok(NOT public.storage_crew_document_allowed(:'ca' || '/crew/' || :'bdeck' || '/documents/00000000-0000-4000-8000-000000000020-a.pdf', 'read'),
                'a permissive predicate: a profile of another company under my company is refused');
SELECT tests.ok(NOT public.storage_crew_document_allowed(:'ca' || '/crew/' || tests.id('profile:ghost')::text || '/documents/00000000-0000-4000-8000-000000000021-a.pdf', 'read'),
                'a permissive predicate: an unknown profile is refused');
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 22), 'insert'), 'a NULL answer from the write predicate is a no');
SELECT tests.denied(format($q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', %L, auth.uid())$q$, tests.crew_doc('A', 'A.deckhand', 23)),
                    'a NULL answer: the upload is refused');
SELECT tests.ok(public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), 'read'), 'control: a well-formed name of my company is read');
SELECT tests.ok(NOT public.storage_crew_document_allowed(n, 'read'), format('a permissive predicate: malformed name refused (%s)', why))
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
SELECT tests.ok(NOT public.storage_crew_document_allowed(tests.crew_doc('A', 'A.deckhand', 1), 'read'), 'a permissive predicate: a disabled member is refused');
SELECT tests.as_anon();
SELECT tests.ok(NOT has_function_privilege('anon', 'public.storage_crew_document_allowed(text,text)', 'EXECUTE'), 'anon cannot call the gate');

-- ------------------------------------------------------------ grants and definer settings (rule 5)

SELECT tests.reset_role();
SELECT tests.ok(has_function_privilege('authenticated', format('public.%s', f), 'EXECUTE') AND has_function_privilege('service_role', format('public.%s', f), 'EXECUTE')
                AND NOT has_function_privilege('anon', format('public.%s', f), 'EXECUTE'),
                format('%s: authenticated and service_role execute, anon does not', f))
FROM unnest(ARRAY['storage_crew_document_allowed(text,text)', 'storage_crew_document_path(text)', 'storage_object_company(text)']) AS f;
SELECT tests.ok(p.prosecdef AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%')
                AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) AS a WHERE a.grantee = 0),
                'the gate is SECURITY DEFINER with a search_path, and PUBLIC holds no EXECUTE')
FROM pg_proc AS p WHERE p.oid = 'public.storage_crew_document_allowed(text,text)'::regprocedure;
SELECT tests.ok(NOT p.prosecdef, format('%s is not a definer (pure)', p.oid::regprocedure))
FROM pg_proc AS p WHERE p.oid IN ('public.storage_crew_document_path(text)'::regprocedure, 'public.storage_object_company(text)'::regprocedure);
