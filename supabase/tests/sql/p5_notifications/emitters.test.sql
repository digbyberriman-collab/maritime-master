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
