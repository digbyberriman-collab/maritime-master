-- Signature images (20261123020100 record_sign_slot / record_resign_slot;
-- gap/08 SIG16, C7): an image path must be a registered, live records-bucket
-- object of the record's company and vessel; its sha256 is stored and the
-- integrity hash covers it. Other tenants' paths, traversal paths,
-- unregistered or removed objects and another vessel's objects are refused.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, company_step, edit_after_sign, delete_rule, slot_template)
VALUES ('test.img', 'test', 'Image', 'IMG', 'vessel', 'none', 'lock', 'draft_only', jsonb_build_array(
  jsonb_build_object('key', 'anyone', 'label', 'Anyone', 'order', 1, 'party', 'vessel', 'required', true),
  jsonb_build_object('key', 'anyone2', 'label', 'Anyone 2', 'order', 1, 'party', 'vessel', 'required', true),
  jsonb_build_object('key', 'anyone3', 'label', 'Anyone 3', 'order', 1, 'party', 'vessel', 'required', true)));

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.img', tests.vessel_id('A.dra'))).id AS env \gset
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT public.record_set_section_digests(:'env', jsonb_build_object('*', repeat('1', 64)));
SELECT tests.reset_role();
CREATE FUNCTION tests.img_slot(p_env uuid, p_key text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.record_signature_slots WHERE envelope_id = p_env AND cycle = 1 AND slot_key = p_key
$$;
GRANT EXECUTE ON FUNCTION tests.img_slot(uuid, text) TO PUBLIC;

-- Registered objects (written as the superuser: the upload path is p4_files).
SELECT tests.company_id('A') || '/' || tests.vessel_id('A.dra') || '/test/sig/' || tests.id('sig-entity') || '/' || tests.id('sig-file') || '-sig.png' AS good_path \gset
SELECT tests.company_id('A') || '/' || tests.vessel_id('A.dra') || '/test/sig/' || tests.id('sig-entity') || '/' || tests.id('sig-gone') || '-gone.png' AS gone_path \gset
SELECT tests.company_id('A') || '/' || tests.vessel_id('A.hyd') || '/test/sig/' || tests.id('sig-entity') || '/' || tests.id('sig-hyd') || '-hyd.png' AS hyd_path \gset
SELECT tests.company_id('B') || '/fleet/hr/doc/' || tests.id('b-doc') || '/' || tests.id('b-file') || '-other-tenant.png' AS b_path \gset
INSERT INTO public.file_objects (id, company_id, vessel_id, bucket, storage_path, module_key, entity_type, entity_id, original_name, mime_type, size_bytes, sha256, removed_at)
VALUES (tests.id('fo:good'), tests.company_id('A'), tests.vessel_id('A.dra'), 'records', :'good_path', 'test', 'sig', tests.id('sig-entity'), 'sig.png', 'image/png', 10, repeat('ab', 32), NULL),
       (tests.id('fo:gone'), tests.company_id('A'), tests.vessel_id('A.dra'), 'records', :'gone_path', 'test', 'sig', tests.id('sig-entity'), 'gone.png', 'image/png', 10, repeat('cd', 32), now()),
       (tests.id('fo:hyd'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'records', :'hyd_path', 'test', 'sig', tests.id('sig-entity'), 'hyd.png', 'image/png', 10, repeat('ef', 32), NULL),
       (tests.id('fo:b'), tests.company_id('B'), NULL, 'records', :'b_path', 'hr', 'doc', tests.id('b-doc'), 'b.png', 'image/png', 10, repeat('12', 32), NULL);

SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.results_eq(
  format($q$SELECT x.p, public.record_sign_slot(gen_random_uuid(), %L, 'verified', NULL, NULL, NULL, NULL, x.p) #>> '{error,code}' FROM (VALUES (%L), (%L), (%L), (%L), (%L)) AS x(p)$q$,
         tests.img_slot(:'env', 'anyone'), :'b_path', '../../signatures/someone-elses/signature.png',
         tests.company_id('A') || '/' || tests.vessel_id('A.dra') || '/test/sig/' || tests.id('sig-entity') || '/never-registered.png', :'gone_path', :'hyd_path'),
  format($q$VALUES (%L, 'invalid_input'), ('../../signatures/someone-elses/signature.png', 'invalid_input'), (%L, 'invalid_input'), (%L, 'invalid_input'), (%L, 'invalid_input')$q$,
         :'b_path', tests.company_id('A') || '/' || tests.vessel_id('A.dra') || '/test/sig/' || tests.id('sig-entity') || '/never-registered.png', :'gone_path', :'hyd_path'),
  'refused: another tenant''s path, a traversal path, an unregistered path, a removed object, another vessel''s object');
SELECT tests.is((SELECT count(*) FROM public.record_signatures WHERE envelope_id = :'env'), 0::bigint, 'none of them signed');
SELECT tests.is(public.record_sign_slot(tests.id('sig:img'), tests.img_slot(:'env', 'anyone'), 'verified', NULL, NULL, NULL, NULL, :'good_path') ->> 'ok', 'true', 'a registered image of this record''s vessel signs');
SELECT tests.is(public.record_sign_slot(tests.id('sig:noimg'), tests.img_slot(:'env', 'anyone2'), 'verified', NULL, NULL, NULL, NULL, '   ') ->> 'ok', 'true', 'a blank image path is no image');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT image_path, image_sha256 FROM public.record_signatures WHERE id = %L$q$, tests.id('sig:img')),
  format($q$VALUES (%L::text, %L::text)$q$, :'good_path', repeat('ab', 32)),
  'the stored image_sha256 is the registered object''s');
SELECT tests.ok((SELECT integrity_hash = public.record_signature_hash(record_digest, slot_id, signer_profile_id, signer_name, signed_at, repeat('ab', 32))
                    AND integrity_hash <> public.record_signature_hash(record_digest, slot_id, signer_profile_id, signer_name, signed_at, NULL)
                 FROM public.record_signatures WHERE id = tests.id('sig:img')), 'the integrity hash covers the image (and changes with it)');
SELECT tests.results_eq(
  format($q$SELECT image_path IS NULL, image_sha256 IS NULL FROM public.record_signatures WHERE id = %L$q$, tests.id('sig:noimg')),
  $q$VALUES (true, true)$q$, 'no image: no path, no hash');

-- Re-sign resolves the image again.
SELECT tests.as_service();
SELECT public.record_set_section_digests(:'env', jsonb_build_object('*', repeat('2', 64)));
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_resign_slot(tests.id('sig:img2'), tests.img_slot(:'env', 'anyone')) ->> 'ok', 'true', 're-sign with the image still registered');
SELECT tests.reset_role();
SELECT tests.ok((SELECT image_sha256 = repeat('ab', 32) AND integrity_hash = public.record_signature_hash(record_digest, slot_id, signer_profile_id, signer_name, signed_at, image_sha256)
                 FROM public.record_signatures WHERE id = tests.id('sig:img2')), 'the new signature carries the image hash');
UPDATE public.file_objects SET removed_at = now() WHERE id = tests.id('fo:good');
SELECT tests.as_service();
SELECT public.record_set_section_digests(:'env', jsonb_build_object('*', repeat('3', 64)));
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_resign_slot(tests.id('sig:img3'), tests.img_slot(:'env', 'anyone')) #>> '{error,code}', 'invalid_input', 're-sign is refused once the image object is removed');
SELECT tests.reset_role();
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'record_signatures_image_hashed_check'), 'a stored image path always has its hash (CHECK)');
