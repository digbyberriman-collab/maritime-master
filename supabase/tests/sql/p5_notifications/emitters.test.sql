-- Every seeded engine notification type has a live emitter or is listed as
-- deferred (D-238, D-164; review round 6, seeded-notification-types-no-emitter):
-- a type with no writer must not be presented as a live subscription
-- (non-negotiable 9), so the client marks the deferred ones "Not available
-- yet". A Records type counts as emitted when its key appears as a literal
-- in the body of a known emitter: record_event_notify(),
-- record_event_notify_personal_data(), record_transition_decide() or the
-- export functions. The deferred list is pinned exactly: a new seed with no
-- emitter fails here, and so does a deferred key that gains an emitter
-- (then remove it from the list, and from the client's list of types
-- without a live emitter).

CREATE TEMP TABLE emitter_fn (name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO emitter_fn VALUES
  ('record_event_notify'), ('record_event_notify_personal_data'), ('record_transition_decide'),
  ('export_job_transition'), ('export_job_log'), ('request_export'), ('log_client_export');
CREATE TEMP TABLE deferred_type (key text PRIMARY KEY, future_emitter text NOT NULL) ON COMMIT DROP;
INSERT INTO deferred_type VALUES
  ('status_request_due', 'the TH5 daily job (a requested update falls due)'),
  ('status_request_overdue', 'the TH5 daily job (a requested update is past due)'),
  ('signature_reminder', 'the SIG Remind action'),
  ('signatures_stale', 'record_set_section_digests when a required signature goes stale'),
  ('invitation_accepted', 'a definer on the accept path, invited_by as the must-act user'),
  ('invitation_bounced', 'the C3 dispatcher bounce feed');
CREATE TEMP TABLE emitter_src ON COMMIT DROP AS
SELECT string_agg(p.prosrc, E'\n' ORDER BY p.proname) AS src, count(DISTINCT p.proname) AS n
FROM pg_proc AS p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (SELECT name FROM emitter_fn);
CREATE TEMP TABLE records_type ON COMMIT DROP AS
SELECT t.key, position('''' || t.key || '''' IN (SELECT src FROM emitter_src)) > 0 AS emitted
FROM public.notification_types AS t
WHERE t.category = 'Records';
GRANT SELECT ON emitter_fn, deferred_type, emitter_src, records_type TO PUBLIC;

SELECT tests.is((SELECT n FROM emitter_src), (SELECT count(*) FROM emitter_fn), 'every known emitter function exists');
SELECT tests.ok((SELECT count(*) FROM records_type) >= 19, format('%s engine notification types are seeded (category Records)', (SELECT count(*) FROM records_type)));
SELECT tests.ok(r.emitted OR EXISTS (SELECT 1 FROM deferred_type AS d WHERE d.key = r.key),
                format('%s: %s', r.key, CASE WHEN r.emitted THEN 'produced by a known emitter' ELSE 'deferred (no live emitter yet)' END))
FROM records_type AS r ORDER BY r.key;
SELECT tests.is_empty($q$SELECT key FROM records_type WHERE NOT emitted AND key NOT IN (SELECT key FROM deferred_type)$q$,
                      'no engine type is seeded without an emitter or a place in the deferred list');
SELECT tests.is_empty($q$SELECT d.key FROM deferred_type AS d JOIN records_type AS r ON r.key = d.key WHERE r.emitted$q$,
                      'no deferred type has gained an emitter (if one has, remove it from the deferred list here and in the client)');
SELECT tests.is_empty($q$SELECT key FROM deferred_type WHERE key NOT IN (SELECT key FROM records_type)$q$, 'every deferred type is seeded (D-164: they stay seeded)');
SELECT tests.results_eq($q$SELECT key FROM records_type WHERE NOT emitted$q$,
                        $q$VALUES ('signature_reminder'::text), ('signatures_stale'::text), ('status_request_due'::text), ('status_request_overdue'::text), ('invitation_accepted'::text), ('invitation_bounced'::text)$q$,
                        'the types without a live emitter are exactly the six deferred ones (D-238)');
SELECT tests.ok((SELECT emitted FROM records_type WHERE key = 'personal_data_exported'), 'personal_data_exported has its emitter (the DPA trigger)');

-- ------------------------------------------------------------ the Phase 3 wave 1 stream types (platform-prep PP4)

-- The stream types (categories Crew, Documents, Training) are seeded once,
-- by 20261124030100, and declared deferred or live in the owning module's
-- manifest (src/modules/<owner>/module.ts, notificationTypes). Their
-- liveness is not pinned here: the slice that lands an emitter flips its
-- type to live in the manifest and proves the emitter in its own SQL test
-- (position('''<key>''' IN prosrc) of the emitter, D-238), so a stream never
-- edits this platform file. Here: each is seeded exactly once, in its
-- category, by that one file; none is an engine Records type; none is in
-- the platform deferred list; and the report notes which already appear
-- in an emitter body.
CREATE TEMP TABLE stream_type (key text PRIMARY KEY, category text NOT NULL, owner text NOT NULL) ON COMMIT DROP;
INSERT INTO stream_type VALUES
  ('crew_document_review_needed', 'Crew', 'crew'), ('crew_document_decided', 'Crew', 'crew'), ('crew_document_expiring', 'Crew', 'crew'),
  ('hor_reminder', 'Crew', 'crew'), ('hor_serious_breach', 'Crew', 'crew'), ('hor_breach_report', 'Crew', 'crew'),
  ('hor_correction_requested', 'Crew', 'crew'), ('familiarisation_assigned', 'Crew', 'crew'), ('crew_transfer_submitted', 'Crew', 'crew'),
  ('crew_transfer_completed', 'Crew', 'crew'), ('crew_employment_ended', 'Crew', 'crew'),
  ('fleet_document_published', 'Documents', 'documents'), ('fleet_document_ack_reminder', 'Documents', 'documents'),
  ('fleet_document_ack_due_soon', 'Documents', 'documents'), ('fleet_document_ack_overdue', 'Documents', 'documents'),
  ('fleet_document_ack_digest', 'Documents', 'documents'),
  ('training_application_action_needed', 'Training', 'development'), ('training_application_updated', 'Training', 'development'),
  ('training_applications_stale', 'Training', 'development');
GRANT SELECT ON stream_type TO PUBLIC;

-- Every (legacy or platform migration file, stream key) pair where the file
-- names the key in quotes. The stream blocks (20261124 hours 04-19, where
-- the emitters live) are left out. Only the seed file may name a key, and
-- the HRIS phase 1 file (with its Lovable copy) the one key it seeded first
-- and the seed adopts: crew_document_expiring.
\set stream_seed_hits `grep -oE "'(crew_document_review_needed|crew_document_decided|crew_document_expiring|hor_reminder|hor_serious_breach|hor_breach_report|hor_correction_requested|familiarisation_assigned|crew_transfer_submitted|crew_transfer_completed|crew_employment_ended|fleet_document_published|fleet_document_ack_reminder|fleet_document_ack_due_soon|fleet_document_ack_overdue|fleet_document_ack_digest|training_application_action_needed|training_application_updated|training_applications_stale)'" supabase/migrations/*.sql | grep -vE '^supabase/migrations/20261124(0[4-9]|1[0-9])' | sed 's#^supabase/migrations/##' | tr -d "'" | tr ':' ' ' | sort -u | tr '\n' ';'`
CREATE TEMP TABLE stream_seed_hit ON COMMIT DROP AS
SELECT split_part(h, ' ', 1) AS file, split_part(h, ' ', 2) AS key
FROM unnest(string_to_array(:'stream_seed_hits', ';')) AS h WHERE h <> '';
GRANT SELECT ON stream_seed_hit TO PUBLIC;

SELECT tests.results_eq($q$SELECT file, key FROM stream_seed_hit$q$,
  $q$SELECT '20261124030100_platform_stream_notification_types.sql', key FROM stream_type
     UNION ALL VALUES ('20260917110000_hris_phase1_employee_records.sql', 'crew_document_expiring'),
                      ('20260917175040_22d84f6b-e16c-4a59-91ed-526077d904ad.sql', 'crew_document_expiring')$q$,
  'the stream types are seeded by one platform file (20261124030100); the only other file naming one is HRIS phase 1 (and its copy) for the adopted crew_document_expiring');
SELECT tests.results_eq($q$SELECT t.key, t.category FROM public.notification_types AS t JOIN stream_type AS s USING (key)$q$,
                        $q$SELECT key, category FROM stream_type$q$,
                        'each of the 19 stream types is seeded once, in its category (Crew 11, Documents 5, Training 3)');
SELECT tests.ok(bool_and(t.cadence IN ('realtime', 'daily', 'weekly') AND length(t.name) > 0 AND t.description IS NOT NULL AND t.default_enabled
                         AND t.description !~* 'e-?mail' AND t.name !~* 'e-?mail'),
                'the stream types have a cadence, a name and a description, are on by default and promise no email (D-249)')
FROM public.notification_types AS t JOIN stream_type AS s USING (key);
SELECT tests.is_empty($q$SELECT key FROM stream_type WHERE key IN (SELECT key FROM records_type) OR key IN (SELECT key FROM deferred_type)$q$,
                      'no stream type is an engine Records type or in the platform deferred list (the manifests own them)');
SELECT tests.is_empty($q$SELECT t.key FROM public.notification_types AS t WHERE t.category IN ('Documents', 'Training') AND t.key NOT IN (SELECT key FROM stream_type)$q$,
                      'the Documents and Training categories hold only the stream types');

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.key, s.owner,
           EXISTS (SELECT 1 FROM pg_proc AS p WHERE p.pronamespace = 'public'::regnamespace AND position('''' || s.key || '''' IN p.prosrc) > 0) AS named
    FROM stream_type AS s ORDER BY s.owner, s.key
  LOOP
    RAISE NOTICE '# stream type % (%): %', r.key, r.owner, CASE WHEN r.named THEN 'named in a function body' ELSE 'no emitter in the database yet' END;
  END LOOP;
END
$$;
