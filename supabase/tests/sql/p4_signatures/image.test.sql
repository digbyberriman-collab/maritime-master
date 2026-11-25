-- Signature images (20261123020100 record_sign_slot / record_resign_slot;
-- gap/08 SIG16, C7): an image path must be a registered, live records-bucket
-- object of the record's company and vessel; its sha256 is stored and the
-- integrity hash covers it. Other tenants' paths, traversal paths,
-- unregistered or removed objects and another vessel's objects are refused.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.crew_dra', 'crew');
SELECT tests.seed_assignment('A.crew_dra', 'A.dra', true, 'Deckhand');

INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, slot_template)
VALUES ('test.img', 'test', 'Image', 'IMG', 'vessel', 'vessel.test.records', 'none', 'lock', 'draft_only', jsonb_build_array(
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

-- ------------------------------------------------------------ the path the app uses (review round 3, sign-image-requires-unsent-sha256)

-- uploadRecordFile stores the object as the user (Storage), then calls
-- register_file_object as the user. With p_sha256 the image signs and the
-- signature carries that hash; without one the refusal says so honestly;
-- the uploader registering again with a hash fills it in (never anyone
-- else, never over a stored hash). Ports scratchpad verify-sigimg/repro.sql.
SELECT tests.seed_user('A', 'A.crew_dra2', 'crew');
SELECT tests.seed_assignment('A.crew_dra2', 'A.dra', true, 'Deckhand');
INSERT INTO public.record_kinds (key, module_key, label, ref_prefix, scope, capability_path, company_step, edit_after_sign, delete_rule, slot_template)
VALUES ('test.img_app', 'test', 'Image (app path)', 'IMA', 'vessel', 'vessel.test.records', 'none', 'lock', 'draft_only', jsonb_build_array(
  jsonb_build_object('key', 's1', 'label', 'Slot 1', 'order', 1, 'party', 'vessel', 'required', true),
  jsonb_build_object('key', 's2', 'label', 'Slot 2', 'order', 1, 'party', 'vessel', 'required', true),
  jsonb_build_object('key', 's3', 'label', 'Slot 3', 'order', 1, 'party', 'vessel', 'required', true),
  jsonb_build_object('key', 's4', 'label', 'Slot 4', 'order', 1, 'party', 'vessel', 'required', true)));
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT (public.record_open_envelope('test.img_app', tests.vessel_id('A.dra'))).id AS app_env \gset
SELECT tests.reset_role();
SELECT tests.as_service();
SELECT public.record_set_section_digests(:'app_env', jsonb_build_object('*', repeat('4', 64)));
SELECT tests.reset_role();
SELECT tests.company_id('A') || '/' || tests.vessel_id('A.dra') || '/safety/incident/' || tests.id('app-ent') || '/' || tests.id('app-hashed') || '-sig.png' AS p_hashed \gset
SELECT tests.company_id('A') || '/' || tests.vessel_id('A.dra') || '/safety/incident/' || tests.id('app-ent') || '/' || tests.id('app-unhashed') || '-sig.png' AS p_unhashed \gset
SELECT repeat('9f', 32) AS sent_sha \gset
SELECT tests.as_user(tests.user_id('A.crew_dra'));
INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
  ('records', :'p_hashed', auth.uid(), jsonb_build_object('size', 10, 'mimetype', 'image/png')),
  ('records', :'p_unhashed', auth.uid(), jsonb_build_object('size', 10, 'mimetype', 'image/png'));
SELECT tests.is((public.register_file_object('records', :'p_hashed', 'sig.png', 'image/png', 10, :'sent_sha')).sha256, :'sent_sha', 'registered with the hash the client sent');
SELECT tests.is(public.record_sign_slot(tests.id('sig:app1'), tests.img_slot(:'app_env', 's1'), 'verified', NULL, NULL, NULL, NULL, :'p_hashed') ->> 'ok', 'true', 'the image signs');
SELECT tests.ok((public.register_file_object('records', :'p_unhashed', 'sig.png', 'image/png', 10)).sha256 IS NULL, 'registered without a hash (as the app did)');
SELECT tests.is(public.record_sign_slot(gen_random_uuid(), tests.img_slot(:'app_env', 's2'), 'verified', NULL, NULL, NULL, NULL, :'p_unhashed') -> 'error',
                jsonb_build_object('code', 'invalid_input', 'message', 'That signature image has no content hash yet. Upload it again.'),
                'an image without a hash gets the honest refusal (not "not found")');
SELECT tests.is(public.record_sign_slot(gen_random_uuid(), tests.img_slot(:'app_env', 's2'), 'verified', NULL, NULL, NULL, NULL,
                                        tests.company_id('A') || '/' || tests.vessel_id('A.dra') || '/safety/incident/' || tests.id('app-ent') || '/' || tests.id('app-none') || '-sig.png') -> 'error',
                jsonb_build_object('code', 'invalid_input', 'message', 'That signature image was not found.'),
                'an unregistered image is still not found');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT image_path, image_sha256 FROM public.record_signatures WHERE id = %L$q$, tests.id('sig:app1')),
  format($q$VALUES (%L::text, %L::text)$q$, :'p_hashed', :'sent_sha'),
  'the signature''s image_sha256 is the hash the client sent');
-- Another user's re-register cannot set the hash.
SELECT tests.as_user(tests.user_id('A.crew_dra2'));
SELECT tests.ok((public.register_file_object('records', :'p_unhashed', 'sig.png', 'image/png', 10, repeat('77', 32))).sha256 IS NULL, 'another user''s re-register leaves the hash empty');
SELECT tests.reset_role();
-- The uploader's re-register with a hash fills it; then the image signs.
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.throws_like(format($q$SELECT public.register_file_object('records', %L, 'sig.png', 'image/png', 10, 'NOT-A-HASH')$q$, :'p_unhashed'), '22023', 'sha256_invalid',
                         'a malformed hash is refused, also on a registered object');
SELECT tests.is((public.register_file_object('records', :'p_unhashed', 'sig.png', 'image/png', 10, repeat('5e', 32))).sha256, repeat('5e', 32), 'the uploader''s re-register backfills the hash');
SELECT tests.is((public.register_file_object('records', :'p_unhashed', 'sig.png', 'image/png', 10, repeat('6a', 32))).sha256, repeat('5e', 32), 'a stored hash is never overwritten');
SELECT tests.is((public.register_file_object('records', :'p_hashed', 'sig.png', 'image/png', 10, repeat('6a', 32))).sha256, :'sent_sha', 'not on the first object either');
SELECT tests.is(public.record_sign_slot(tests.id('sig:app2'), tests.img_slot(:'app_env', 's2'), 'verified', NULL, NULL, NULL, NULL, :'p_unhashed') ->> 'ok', 'true', 'the backfilled image signs');
SELECT tests.reset_role();
SELECT tests.is((SELECT image_sha256 FROM public.record_signatures WHERE id = tests.id('sig:app2')), repeat('5e', 32), 'with the backfilled hash');
-- Re-sign: an object whose hash changed, or vanished, gets its own refusal.
SELECT tests.as_service();
SELECT public.record_set_section_digests(:'app_env', jsonb_build_object('*', repeat('5', 64)));
SELECT tests.reset_role();
UPDATE public.file_objects SET sha256 = repeat('00', 32) WHERE storage_path = :'p_hashed';
UPDATE public.file_objects SET sha256 = NULL WHERE storage_path = :'p_unhashed';
SELECT tests.as_user(tests.user_id('A.crew_dra'));
SELECT tests.is(public.record_resign_slot(gen_random_uuid(), tests.img_slot(:'app_env', 's1')) -> 'error',
                jsonb_build_object('code', 'invalid_input', 'message', 'That signature image has changed since it was signed.'),
                're-sign: an image whose hash changed since it was signed');
SELECT tests.is(public.record_resign_slot(gen_random_uuid(), tests.img_slot(:'app_env', 's2')) -> 'error',
                jsonb_build_object('code', 'invalid_input', 'message', 'That signature image has no content hash yet. Upload it again.'),
                're-sign: an image without a hash');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the hash binds the stored name to the signer (review round 3, signer-name-self-editable; D-209)

-- Ports scratchpad verify-signer/s5b.sql: a self-rename still signs (the
-- display contract is D-209), but the integrity hash covers the stored
-- name and the profile id as two elements, so a later edit of either is
-- detectable.
SELECT tests.as_user(tests.user_id('A.crew_dra'));
UPDATE public.profiles SET first_name = 'Master', last_name = 'of DRAAK (Captain)' WHERE user_id = auth.uid();
SELECT tests.is(public.record_sign_slot(tests.id('sig:renamed'), tests.img_slot(:'app_env', 's3'), 'verified') ->> 'ok', 'true', 's5b: a self-renamed crew member still signs');
UPDATE public.profiles SET first_name = 'Crew', last_name = 'A.crew_dra' WHERE user_id = auth.uid();
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT signer_name, signer_profile_id FROM public.record_signatures WHERE id = %L$q$, tests.id('sig:renamed')),
  format($q$VALUES ('Master of DRAAK (Captain)'::text, %L::uuid)$q$, tests.profile_id('A.crew_dra')),
  's5b: the row stores the name used and the signer''s own profile id');
SELECT tests.ok((SELECT integrity_hash = public.record_signature_hash(record_digest, slot_id, signer_profile_id, 'Master of DRAAK (Captain)', signed_at, image_sha256)
                    AND integrity_hash <> public.record_signature_hash(record_digest, slot_id, signer_profile_id, 'Crew A.crew_dra', signed_at, image_sha256)
                    AND integrity_hash <> public.record_signature_hash(record_digest, slot_id, NULL, signer_name, signed_at, image_sha256)
                 FROM public.record_signatures WHERE id = tests.id('sig:renamed')),
                's5b: the hash binds the stored name and the profile id (another name or no profile gives another hash)');
SELECT tests.ok((SELECT bool_and(integrity_hash = public.record_signature_hash(record_digest, slot_id, signer_profile_id, signer_name, signed_at, image_sha256)
                                 AND integrity_hash <> public.record_signature_hash(record_digest, slot_id, signer_profile_id, signer_name || ' (edited)', signed_at, image_sha256))
                 FROM public.record_signatures WHERE envelope_id IN (:'env', :'app_env')),
                'every signature of this file recomputes from its stored name, and differs with another name');
SELECT tests.isnt(public.record_signature_hash(repeat('1', 64), tests.id('slot'), tests.id('profile'), 'Name', '2026-11-25T00:00:00Z', NULL),
                  public.record_signature_hash(repeat('1', 64), tests.id('slot'), tests.id('profile'), 'Other', '2026-11-25T00:00:00Z', NULL),
                  'record_signature_hash depends on the name even when a profile id is given');
