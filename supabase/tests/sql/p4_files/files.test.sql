-- Record files and links (spec §A.13; gap/08 UP1-UP3; C7, C8; CC-12,
-- CC-21): the records bucket equals upload-policy.json; every path case of
-- the fixture (seeded ids) through storage_path_allowed; reach per persona;
-- cross-tenant upload and read refused; no storage update / delete;
-- register needs the stored object (size, type, uploader); attach to a
-- closed record refused unless the kind allows late evidence; versions;
-- entity attachments; soft removal rules (submit, reason, legal hold);
-- links (denormalised vessel, same company, idempotent, soft unlink);
-- isolation of the three tables; no direct writes; anon denied.

\set fixture `cat supabase/tests/fixtures/upload-policy.json`

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_assignment('A.disabled', 'A.dra', true, 'Deckhand');

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, report_first, decision_kind, allow_reopen, allow_close_as, edit_after_sign, delete_rule, slot_template, allow_late_evidence)
VALUES
  ('test.permit', 'test', 'Permit to work', 'PTW', 'vessel', 'vessel.test.records', 'sign_off', false, false, true, true, 'lock', 'never_after_submit',
   jsonb_build_array(jsonb_build_object('key', 'prepared_by', 'label', 'Prepared by', 'order', 1, 'party', 'vessel')), false),
  ('test.note', 'test', 'Note', 'NTE', 'vessel', 'vessel.test.records', 'none', false, false, false, false, 'allow_with_flag', 'draft_only',
   jsonb_build_array(jsonb_build_object('key', 'author', 'label', 'Author', 'order', 1, 'party', 'vessel')), false),
  ('test.evidence', 'test', 'Evidence log', 'EVL', 'vessel', 'vessel.test.records', 'none', false, false, false, false, 'allow_with_flag', 'draft_only',
   jsonb_build_array(jsonb_build_object('key', 'author', 'label', 'Author', 'order', 1, 'party', 'vessel')), true);

-- helpers (rolled back with the file)
CREATE FUNCTION tests.rec_path(p_company text, p_vessel text, p_module text, p_entity_type text, p_entity uuid, p_file_no integer, p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT p_company || '/' || p_vessel || '/' || p_module || '/' || p_entity_type || '/' || p_entity::text || '/'
         || '00000000-0000-4000-8000-' || lpad(p_file_no::text, 12, '0') || '-' || p_name
$$;
-- Store an object as the current user (the storage API's insert, with its metadata).
CREATE FUNCTION tests.store(p_path text, p_size bigint DEFAULT 1234, p_mime text DEFAULT 'application/pdf')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('records', p_path, auth.uid(), jsonb_build_object('size', p_size, 'mimetype', p_mime))
$$;
CREATE FUNCTION tests.slot_of(p_env uuid, p_key text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT sl.id FROM public.record_signature_slots AS sl JOIN public.record_envelopes AS e ON e.id = sl.envelope_id
  WHERE sl.envelope_id = p_env AND sl.cycle = e.current_cycle AND sl.slot_key = p_key
$$;
GRANT EXECUTE ON FUNCTION tests.rec_path(text, text, text, text, uuid, integer, text), tests.store(text, bigint, text), tests.slot_of(uuid, text) TO PUBLIC;

SELECT tests.company_id('A') AS ca, tests.company_id('B') AS cb, tests.vessel_id('A.dra') AS dra, tests.vessel_id('A.hyd') AS hyd,
       tests.vessel_id('B.lev') AS lev, tests.id('entity:incident:1') AS ent \gset

-- ------------------------------------------------------------ the bucket equals the fixture

SELECT tests.results_eq(
  $q$SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'records'$q$,
  format($q$SELECT 'records'::text, 'records'::text, false, %s::bigint, ARRAY(SELECT jsonb_array_elements_text(%L::jsonb -> 'mimeTypes'))$q$,
         (:'fixture'::jsonb ->> 'maxBytes'), :'fixture'),
  'records bucket: private, 50 MB, the fixture''s MIME types in order');
SELECT tests.is((:'fixture'::jsonb ->> 'bucket'), 'records', 'fixture bucket name');
SELECT tests.ok(
  (SELECT array_agg(m ORDER BY m) FROM regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') AS r(mm), LATERAL (SELECT mm[1] AS m) x)
  = (SELECT array_agg(v ORDER BY v) FROM jsonb_array_elements_text(:'fixture'::jsonb -> 'mimeTypes') AS v),
  'file_objects mime_type CHECK lists exactly the fixture''s types')
FROM pg_constraint AS c WHERE c.conname = 'file_objects_mime_type_check';
SELECT tests.ok(position((:'fixture'::jsonb ->> 'maxBytes') IN pg_get_constraintdef(c.oid)) > 0, 'file_objects size CHECK uses the fixture''s limit')
FROM pg_constraint AS c WHERE c.conname = 'file_objects_size_bytes_check';
SELECT tests.is((SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'records\_%'), 2::bigint,
  'exactly two records_ storage policies (select, insert): no update / delete');

-- ------------------------------------------------------------ path cases (fixture, seeded ids)

SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(
  public.storage_path_allowed('records', p.resolved, true),
  (c ->> 'valid')::boolean,
  format('path case %s (%s): write', ord, coalesce(c ->> 'why', 'valid')))
FROM jsonb_array_elements(:'fixture'::jsonb -> 'paths') WITH ORDINALITY AS t(c, ord),
LATERAL (SELECT replace(replace(replace(replace(replace(c ->> 'path', 'OTHERCOMPANY', :'cb'), 'OTHERVESSEL', :'lev'), 'COMPANY', :'ca'), 'VESSEL', :'dra'), 'ENTITY', :'ent') AS resolved) AS p;
SELECT tests.is(
  public.storage_path_allowed('records', p.resolved, false),
  (c ->> 'valid')::boolean,
  format('path case %s: read', ord))
FROM jsonb_array_elements(:'fixture'::jsonb -> 'paths') WITH ORDINALITY AS t(c, ord),
LATERAL (SELECT replace(replace(replace(replace(replace(c ->> 'path', 'OTHERCOMPANY', :'cb'), 'OTHERVESSEL', :'lev'), 'COMPANY', :'ca'), 'VESSEL', :'dra'), 'ENTITY', :'ent') AS resolved) AS p;
SELECT tests.ok(public.storage_path_allowed('records', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 20, 'a' || repeat('b', 199)), true), 'a 200-character safe name is allowed');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 21, 'a' || repeat('b', 200)), true), 'a 201-character name is refused');
SELECT tests.ok(NOT public.storage_path_allowed('avatars', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 22, 'a.pdf'), true), 'another bucket is refused');
SELECT tests.ok(NOT coalesce(public.storage_path_allowed('records', NULL, true), false), 'no path is refused');
SELECT tests.ok(NOT public.storage_path_allowed('records', upper(:'ca') || substr(tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 23, 'a.pdf'), 37), true), 'an upper-case company uuid is refused');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 24, E'a\tb.pdf'), true), 'a control character is refused');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', tests.id('vessel:nowhere')::text, 'safety', 'incident', :'ent', 25, 'a.pdf'), true), 'an unknown vessel is refused');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(tests.id('company:nowhere')::text, :'dra', 'safety', 'incident', :'ent', 26, 'a.pdf'), true), 'an unknown company is refused');

-- ------------------------------------------------------------ reach per persona

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.ok(public.storage_path_allowed('records', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 30, 'a.pdf'), true), 'the Master of DRAAK may write DRAAK paths');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', :'hyd', 'safety', 'incident', :'ent', 31, 'a.pdf'), true), 'but not HYDRA paths (no reach)');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', 'fleet', 'documents', 'policy', :'ent', 32, 'a.pdf'), false), 'nor fleet paths (no fleet reach)');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.ok(public.storage_path_allowed('records', tests.rec_path(:'ca', :'hyd', 'safety', 'incident', :'ent', 33, 'a.pdf'), true), 'HYDRA crew may write HYDRA paths');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 34, 'a.pdf'), false), 'HYDRA crew may not read DRAAK paths');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 35, 'a.pdf'), false), 'a disabled user reaches no path, even on their vessel');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 36, 'a.pdf'), false), 'company B reaches no company A path');
SELECT tests.ok(public.storage_path_allowed('records', tests.rec_path(:'cb', :'lev', 'safety', 'incident', :'ent', 37, 'a.pdf'), true), 'company B reaches its own LEVIATHAN path');
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'cb', :'dra', 'safety', 'incident', :'ent', 38, 'a.pdf'), true), 'company B cannot name company A''s vessel under its own company');
SELECT tests.as_anon();
SELECT tests.throws($q$SELECT public.storage_path_allowed('records', 'x', false)$q$, '42501', 'anon cannot execute storage_path_allowed');
SELECT tests.reset_role();
SELECT tests.ok(NOT public.storage_path_allowed('records', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 39, 'a.pdf'), false), 'no JWT caller -> false (fail closed)');

-- ------------------------------------------------------------ uploads (storage.objects through the policies)

SELECT tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 101, 'report.pdf') AS p_dra1,
       tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 102, 'photo.jpg') AS p_dra2,
       tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 103, 'late.pdf') AS p_dra3,
       tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 104, 'v2.pdf') AS p_dra4,
       tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 105, 'entity.pdf') AS p_dra5,
       tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 106, 'big.pdf') AS p_dra6,
       tests.rec_path(:'ca', :'hyd', 'safety', 'incident', :'ent', 107, 'hydra.pdf') AS p_hyd1,
       tests.rec_path(:'ca', 'fleet', 'documents', 'policy', :'ent', 108, 'manual.pdf') AS p_fleet1 \gset

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.lives(format('SELECT tests.store(%L)', :'p_dra1'), 'DRAAK crew upload to a DRAAK path');
SELECT tests.lives(format('SELECT tests.store(%L, 2048, %L)', :'p_dra2', 'image/jpeg'), 'a second DRAAK upload');
SELECT tests.lives(format('SELECT tests.store(%L)', :'p_dra3'), 'a third DRAAK upload');
SELECT tests.lives(format('SELECT tests.store(%L)', :'p_dra4'), 'a fourth DRAAK upload');
SELECT tests.lives(format('SELECT tests.store(%L)', :'p_dra5'), 'a fifth DRAAK upload');
SELECT tests.lives(format('SELECT tests.store(%L, 60000000)', :'p_dra6'), 'a stored object whose metadata says 60 MB');
SELECT tests.throws(format('SELECT tests.store(%L)', :'p_hyd1'), '42501', 'DRAAK crew cannot upload to a HYDRA path');
SELECT tests.throws(format('SELECT tests.store(%L)', :'p_fleet1'), '42501', 'DRAAK crew cannot upload to a fleet path');
SELECT tests.throws(format('SELECT tests.store(%L)', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 109, '.hidden')), '42501', 'a path the rule refuses cannot be uploaded');
SELECT tests.denied(format($q$UPDATE storage.objects SET metadata = '{}'::jsonb WHERE name = %L RETURNING id$q$, :'p_dra1'), 'no storage UPDATE of a records object');
SELECT tests.denied(format($q$DELETE FROM storage.objects WHERE name = %L RETURNING id$q$, :'p_dra1'), 'no storage DELETE of a records object');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.lives(format('SELECT tests.store(%L)', :'p_hyd1'), 'HYDRA crew upload to a HYDRA path');
SELECT tests.denied(format($q$SELECT * FROM storage.objects WHERE name = %L$q$, :'p_dra1'), 'HYDRA crew cannot read a DRAAK object');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format('SELECT tests.store(%L)', :'p_fleet1'), 'the fleet manager uploads to a fleet path');
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'records'), 8::bigint, 'the fleet manager reads every company A object');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format('SELECT tests.store(%L)', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 110, 'x.pdf')), '42501', 'company B cannot upload to a company A path');
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'records'), 0::bigint, 'company B reads no company A object');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM storage.objects WHERE bucket_id = 'records'), 0::bigint, 'a disabled user reads no object');
SELECT tests.as_anon();
SELECT tests.denied($q$SELECT * FROM storage.objects WHERE bucket_id = 'records'$q$, 'anon reads no records object');
SELECT tests.reset_role();

-- ------------------------------------------------------------ register_file_object

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.register_file_object('records', :'p_dra1', 'Report.pdf', 'application/pdf', 1234)).id AS f1 \gset
SELECT tests.results_eq(format($q$SELECT company_id, vessel_id, bucket, module_key, entity_type, entity_id, original_name, mime_type, size_bytes, uploaded_by, source, legal_hold
                                FROM public.file_objects WHERE id = %L$q$, :'f1'),
  format($q$VALUES (%L::uuid, %L::uuid, 'records'::text, 'safety'::text, 'incident'::text, %L::uuid, 'Report.pdf'::text, 'application/pdf'::text, 1234::bigint, %L::uuid, 'upload'::text, false)$q$,
         :'ca', :'dra', :'ent', tests.user_id('A.crew_dra')),
  'register parses company, vessel, module and entity from the path; uploader = the caller');
SELECT tests.is((public.register_file_object('records', :'p_dra1', 'Report.pdf', 'application/pdf', 1234)).id, :'f1'::uuid, 'register is idempotent on (bucket, path)');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'a.pdf', 'application/pdf', 10)$q$, tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 120, 'never.pdf')), 'P0002', 'file_not_stored', 'register needs the stored object (P0002)');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'p.jpg', 'image/jpeg', 99)$q$, :'p_dra2'), '22023', 'file_size_mismatch', 'the stored size must equal the registered size');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'p.jpg', 'image/png', 2048)$q$, :'p_dra2'), '22023', 'file_type_mismatch', 'the stored type must equal the registered type');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'p.html', 'text/html', 2048)$q$, :'p_dra2'), '22023', 'file_type_not_allowed', 'a type off the allow-list is refused');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'p.jpg', 'image/jpeg', 0)$q$, :'p_dra2'), '22023', 'file_empty', 'an empty file is refused');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'big.pdf', 'application/pdf', 60000000)$q$, :'p_dra6'), '22023', 'file_too_large', 'over 50 MB is refused');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, '   ', 'image/jpeg', 2048)$q$, :'p_dra2'), '22023', 'file_name_invalid', 'a blank name is refused');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'p.jpg', 'image/jpeg', 2048, 'nothex')$q$, :'p_dra2'), '22023', 'sha256_invalid', 'a malformed sha256 is refused');
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'h.pdf', 'application/pdf', 1234)$q$, :'p_hyd1'), '42501', 'file_access_denied', 'a path the caller may not write is refused (42501)');
SELECT (public.register_file_object('records', :'p_dra2', 'Photo.jpg', 'image/jpeg', 2048, repeat('a', 64))).id AS f2 \gset
SELECT (public.register_file_object('records', :'p_dra3', 'Late.pdf', 'application/pdf', 1234)).id AS f3 \gset
SELECT (public.register_file_object('records', :'p_dra4', 'V2.pdf', 'application/pdf', 1234)).id AS f4 \gset
SELECT (public.register_file_object('records', :'p_dra5', 'Entity.pdf', 'application/pdf', 1234)).id AS f5 \gset
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((public.register_file_object('records', :'p_dra1', 'Other.pdf', 'application/pdf', 1234)).id, :'f1'::uuid, 'a colleague who may write the path gets the existing row back, unchanged');
SELECT tests.is((SELECT original_name FROM public.file_objects WHERE id = :'f1'), 'Report.pdf', 'the existing row keeps the uploader''s name');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT (public.register_file_object('records', :'p_hyd1', 'Hydra.pdf', 'application/pdf', 1234)).id AS fh \gset
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'h.pdf', 'application/pdf', 1234)$q$, tests.rec_path(:'ca', :'hyd', 'safety', 'incident', :'ent', 121, 'x.pdf')), 'P0002', 'file_not_stored', 'the fleet manager still needs a stored object');
SELECT (public.register_file_object('records', :'p_fleet1', 'Manual.pdf', 'application/pdf', 1234)).id AS ffleet \gset
SELECT tests.is((SELECT vessel_id FROM public.file_objects WHERE id = :'ffleet'), NULL::uuid, 'a fleet path registers with no vessel');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.lives(format('SELECT tests.store(%L)', tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 122, 'by-master.pdf')), 'the Master uploads');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'm.pdf', 'application/pdf', 1234)$q$, tests.rec_path(:'ca', :'dra', 'safety', 'incident', :'ent', 122, 'by-master.pdf')), '42501', 'file_access_denied', 'only the uploader registers a new object');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.register_file_object('records', %L, 'r.pdf', 'application/pdf', 1234)$q$, :'p_dra1'), '42501', 'company B cannot register a company A object');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.register_file_object('records', %L, 'r.pdf', 'application/pdf', 1234)$q$, :'p_dra1'), '42501', 'a disabled user cannot register');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT public.register_file_object('records', %L, 'r.pdf', 'application/pdf', 1234)$q$, :'p_dra1'), '42501', 'anon cannot execute register_file_object');
SELECT tests.reset_role();

-- ------------------------------------------------------------ records to attach to

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.permit', :'dra', tests.id('files:permit'))).id AS permit \gset
SELECT (public.record_open_envelope('test.note', :'dra', tests.id('files:note'))).id AS note \gset
SELECT (public.record_open_envelope('test.evidence', :'dra', tests.id('files:evidence'))).id AS evidence \gset
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT (public.record_open_envelope('test.permit', :'hyd', tests.id('files:permit_hyd'))).id AS permit_hyd \gset
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT (public.record_open_envelope('test.permit', :'lev', tests.id('files:permit_lev'))).id AS permit_lev \gset
SELECT tests.reset_role();

-- ------------------------------------------------------------ attach_record_file

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.attach_record_file(:'f1', :'permit', 'evidence', 'Gas readings')).id AS a1 \gset
SELECT tests.results_eq(format($q$SELECT file_id, company_id, vessel_id, envelope_id, entity_type, entity_id, section_key, caption, sort_order, added_by FROM public.record_attachments WHERE id = %L$q$, :'a1'),
  format($q$VALUES (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 'incident'::text, %L::uuid, 'evidence'::text, 'Gas readings'::text, 1, %L::uuid)$q$,
         :'f1', :'ca', :'dra', :'permit', :'ent', tests.user_id('A.crew_dra')),
  'attach: the record''s company and vessel, the file''s entity, first in order, added by the caller');
SELECT tests.is((public.attach_record_file(:'f1', :'permit', 'evidence', 'Gas readings')).id, :'a1'::uuid, 'attaching the same file again returns the live attachment');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE envelope_id = :'permit' AND action = 'attachment.added'), 1::bigint, 'one attachment.added event');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L, 'Bad Key')$q$, :'f2', :'permit'), '22023', 'section_key_invalid', 'a malformed section key is refused');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L, NULL, %L)$q$, :'f2', :'permit', repeat('c', 501)), '22023', 'caption_too_long', 'a caption over 500 characters is refused');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'fh', :'permit'), '42501', 'record_access_denied', 'a HYDRA file is not readable by DRAAK crew');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'f2', :'permit_hyd'), '42501', 'record_access_denied', 'a HYDRA record is not readable by DRAAK crew');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L)$q$, tests.id('file:nowhere'), :'permit'), 'P0002', 'file_not_found', 'an unknown file is P0002');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'f2', tests.id('env:nowhere')), 'P0002', 'record_not_found', 'an unknown record is P0002');
SELECT (public.attach_record_file(:'f4', :'permit', 'evidence', NULL, :'a1')).id AS a4 \gset
SELECT tests.is((SELECT version_of FROM public.record_attachments WHERE id = :'a4'), :'a1'::uuid, 'a new version of an attachment of the same record');
SELECT tests.is((SELECT sort_order FROM public.record_attachments WHERE id = :'a4'), 2, 'the next sort order');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L, NULL, NULL, %L)$q$, :'f2', :'note', :'a1'), '22023', 'version_of_invalid', 'version_of must be an attachment of the same record');
SELECT (public.attach_record_file(:'f5')).id AS a5 \gset
SELECT tests.results_eq(format($q$SELECT envelope_id, entity_type, entity_id FROM public.record_attachments WHERE id = %L$q$, :'a5'),
  format($q$VALUES (NULL::uuid, 'incident'::text, %L::uuid)$q$, :'ent'), 'without a record the file''s entity is the attachment''s');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE entity_type = 'incident' AND entity_id = :'ent' AND envelope_id IS NULL AND action = 'attachment.added'), 1::bigint, 'an entity attachment.added event');
SELECT tests.as_user(tests.user_id('A.crew_dra'), '{"app_metadata": {"impersonating": true}}');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'f2', :'permit'), '22023', 'impersonating', 'no attachment while impersonating');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'f2', :'permit_hyd'), '22023', 'file_scope_mismatch', 'a DRAAK file cannot be attached to a HYDRA record');
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'ffleet', :'permit'), '22023', 'file_scope_mismatch', 'a fleet file cannot be attached to a vessel record');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'f2', :'permit'), '42501', 'company B cannot attach to company A');
SELECT tests.throws(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'f2', :'permit_lev'), '42501', 'nor attach company A''s file to its own record');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'f2', :'permit'), '42501', 'a disabled user cannot attach');

-- A closed record takes no new file, unless its kind allows late evidence.
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is((public.record_sign_slot(tests.id('files:sig:note'), tests.slot_of(:'note', 'author'), 'verified')) ->> 'ok', 'true', 'the note is signed');
SELECT tests.is((public.record_sign_slot(tests.id('files:sig:evidence'), tests.slot_of(:'evidence', 'author'), 'verified')) ->> 'ok', 'true', 'the evidence log is signed');
SELECT tests.reset_role();
SELECT tests.results_eq(format($q$SELECT status FROM public.record_envelopes WHERE id IN (%L, %L) ORDER BY reference$q$, :'note', :'evidence'), $q$VALUES ('closed'::text), ('closed')$q$, 'both records closed (no company step)');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.throws_like(format($q$SELECT public.attach_record_file(%L, %L)$q$, :'f2', :'note'), '22023', 'record_closed', 'a closed record takes no new file (22023 record_closed)');
SELECT (public.attach_record_file(:'f3', :'evidence')).id AS a3 \gset
SELECT tests.ok(:'a3' IS NOT NULL, 'a kind with late evidence takes a file after closing');

-- ------------------------------------------------------------ remove_record_attachment

SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws(format($q$SELECT public.remove_record_attachment(%L)$q$, :'a1'), '42501', 'HYDRA crew cannot remove a DRAAK attachment');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT (public.remove_record_attachment(:'a4')).removed_by AS rm4 \gset
SELECT tests.is(:'rm4'::uuid, tests.user_id('A.master_dra'), 'before submission anyone who reaches the vessel removes a file (soft)');
SELECT tests.is((public.remove_record_attachment(:'a4')).removed_by, tests.user_id('A.master_dra'), 'removing again returns it unchanged');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE envelope_id = :'permit' AND action = 'attachment.removed'), 1::bigint, 'one attachment.removed event');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.throws_like(format($q$SELECT public.remove_record_attachment(%L, 'Wrong file')$q$, :'a3'), '22023', 'not_allowed', 'after submission (closed) the vessel cannot remove');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.remove_record_attachment(%L)$q$, :'a3'), '22023', 'reason_required', 'the company needs a reason after submission');
SELECT tests.throws_like(format($q$SELECT public.remove_record_attachment(%L, %L)$q$, :'a3', repeat('r', 501)), '22023', 'reason_too_long', 'a reason over 500 characters is refused');
SELECT tests.reset_role();
UPDATE public.file_objects SET legal_hold = true WHERE id = :'f3';
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$SELECT public.remove_record_attachment(%L, 'Wrong file')$q$, :'a3'), '22023', 'legal_hold', 'legal hold refuses removal');
SELECT tests.reset_role();
UPDATE public.file_objects SET legal_hold = false WHERE id = :'f3';
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((public.remove_record_attachment(:'a3', 'Wrong file')).removal_reason, 'Wrong file', 'the company removes with a reason after submission');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.remove_record_attachment(%L, 'x')$q$, :'a1'), '42501', 'company B cannot remove company A attachments');

-- ------------------------------------------------------------ links

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.link_records(:'permit', :'note', NULL, NULL, 'follow_up', 'See the note')).id AS l1 \gset
SELECT tests.results_eq(format($q$SELECT company_id, vessel_id, from_envelope_id, to_envelope_id, link_kind, note, created_by FROM public.record_links WHERE id = %L$q$, :'l1'),
  format($q$VALUES (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 'follow_up'::text, 'See the note'::text, %L::uuid)$q$, :'ca', :'dra', :'permit', :'note', tests.user_id('A.crew_dra')),
  'a link carries the from-record''s company and vessel');
SELECT tests.is((public.link_records(:'permit', :'note', NULL, NULL, 'follow_up')).id, :'l1'::uuid, 'a live link with the same target and kind is returned (idempotent)');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE envelope_id = :'permit' AND action = 'link.added'), 1::bigint, 'one link.added event');
SELECT (public.link_records(:'permit', NULL, 'crew_member', tests.id('entity:crew:1'))).id AS l2 \gset
SELECT tests.is((SELECT to_entity_type FROM public.record_links WHERE id = :'l2'), 'crew_member', 'a link to an item');
SELECT tests.throws_like(format($q$SELECT public.link_records(%L, %L)$q$, :'permit', :'permit'), '22023', 'link_to_self', 'a record never links to itself');
SELECT tests.throws_like(format($q$SELECT public.link_records(%L)$q$, :'permit'), '22023', 'link_target_invalid', 'a link needs a target');
SELECT tests.throws_like(format($q$SELECT public.link_records(%L, %L, 'crew_member', %L)$q$, :'permit', :'note', tests.id('entity:crew:1')), '22023', 'link_target_invalid', 'one target only');
SELECT tests.throws_like(format($q$SELECT public.link_records(%L, NULL, 'crew_member')$q$, :'permit'), '22023', 'link_target_invalid', 'an item target needs its id');
SELECT tests.throws_like(format($q$SELECT public.link_records(%L, %L, NULL, NULL, 'blocks')$q$, :'permit', :'note'), '22023', 'link_kind_invalid', 'an unknown link kind is refused');
SELECT tests.throws(format($q$SELECT public.link_records(%L, %L)$q$, :'permit', :'permit_hyd'), '42501', 'DRAAK crew cannot link to a HYDRA record they cannot read');
SELECT tests.throws(format($q$SELECT public.link_records(%L, %L)$q$, :'permit', :'permit_lev'), '42501', 'a link never crosses companies');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.link_records(%L, %L)$q$, :'permit_lev', :'permit'), '42501', 'company B cannot link to a company A record');
SELECT tests.reset_role();
-- The scope trigger overwrites a service-role or client value.
INSERT INTO public.record_links (company_id, vessel_id, from_envelope_id, to_entity_type, to_entity_id)
VALUES (:'cb', :'lev', :'permit', 'crew_member', tests.id('entity:crew:2')) RETURNING id AS l3 \gset
SELECT tests.results_eq(format($q$SELECT company_id, vessel_id FROM public.record_links WHERE id = %L$q$, :'l3'),
  format($q$VALUES (%L::uuid, %L::uuid)$q$, :'ca', :'dra'), 'trg_record_links_scope stamps company and vessel from the from-record');
UPDATE public.record_links SET vessel_id = :'hyd' WHERE id = :'l3';
SELECT tests.is((SELECT vessel_id FROM public.record_links WHERE id = :'l3'), :'dra'::uuid, 'an update re-stamps the from-record''s vessel');

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.unlink_records(%L)$q$, :'l1'), '22023', 'not_allowed', 'only the creator or the company removes a link');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.ok((public.unlink_records(:'l1')).removed_at IS NOT NULL, 'the creator removes the link (soft)');
SELECT tests.ok((public.unlink_records(:'l1')).removed_at IS NOT NULL, 'removing again returns it unchanged');
SELECT tests.isnt((public.link_records(:'permit', :'note', NULL, NULL, 'follow_up')).id, :'l1'::uuid, 'after removal the same link can be added again');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok((public.unlink_records(:'l2')).removed_by = tests.user_id('A.fleet_manager'), 'a company actor removes anyone''s link');
SELECT tests.is((SELECT count(*) FROM public.record_events WHERE envelope_id = :'permit' AND action = 'link.removed'), 2::bigint, 'link.removed events');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws(format($q$SELECT public.unlink_records(%L)$q$, :'l3'), '42501', 'company B cannot remove company A links');

-- ------------------------------------------------------------ isolation, direct writes, anon

SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.file_objects), 0::bigint, 'company B reads no company A file');
SELECT tests.is((SELECT count(*) FROM public.record_attachments), 0::bigint, 'company B reads no company A attachment');
SELECT tests.is((SELECT count(*) FROM public.record_links), 0::bigint, 'company B reads no company A link');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.file_objects), 1::bigint, 'HYDRA crew read only the HYDRA file');
SELECT tests.is((SELECT count(*) FROM public.record_attachments), 0::bigint, 'HYDRA crew read no DRAAK attachment');
SELECT tests.is((SELECT count(*) FROM public.record_links), 0::bigint, 'HYDRA crew read no DRAAK link');
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is((SELECT count(*) FROM public.file_objects WHERE vessel_id = :'dra'), 5::bigint, 'DRAAK crew read the DRAAK files');
SELECT tests.is((SELECT count(*) FROM public.file_objects WHERE vessel_id IS NULL), 0::bigint, 'but not fleet files (no fleet reach)');
SELECT tests.is((SELECT count(*) FROM public.record_links), 4::bigint, 'DRAAK crew read the DRAAK links, removed ones included');
SELECT tests.throws(format($q$INSERT INTO public.file_objects (company_id, bucket, storage_path, module_key, entity_type, entity_id, original_name, mime_type, size_bytes) VALUES (%L, 'records', 'x', 'm', 'e', %L, 'n', 'application/pdf', 1)$q$, :'ca', :'ent'), '42501', 'no direct insert into file_objects');
SELECT tests.throws(format($q$INSERT INTO public.record_attachments (file_id, company_id, envelope_id) VALUES (%L, %L, %L)$q$, :'f1', :'ca', :'permit'), '42501', 'no direct insert into record_attachments');
SELECT tests.throws(format($q$INSERT INTO public.record_links (company_id, from_envelope_id, to_envelope_id) VALUES (%L, %L, %L)$q$, :'ca', :'permit', :'note'), '42501', 'no direct insert into record_links');
SELECT tests.throws(format($q$UPDATE public.record_attachments SET removed_at = NULL WHERE id = %L$q$, :'a4'), '42501', 'no direct update of record_attachments');
SELECT tests.throws(format($q$UPDATE public.file_objects SET legal_hold = false WHERE id = %L$q$, :'f1'), '42501', 'no direct update of file_objects');
SELECT tests.throws(format($q$DELETE FROM public.record_links WHERE id = %L$q$, :'l1'), '42501', 'no direct delete of record_links');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.file_objects) + (SELECT count(*) FROM public.record_attachments) + (SELECT count(*) FROM public.record_links), 0::bigint, 'a disabled user reads none of the three tables');
SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.file_objects', 'anon reads no file_objects');
SELECT tests.denied('SELECT * FROM public.record_attachments', 'anon reads no record_attachments');
SELECT tests.denied('SELECT * FROM public.record_links', 'anon reads no record_links');
SELECT tests.throws(format($q$SELECT public.link_records(%L, %L)$q$, :'permit', :'note'), '42501', 'anon cannot execute link_records');
SELECT tests.reset_role();
