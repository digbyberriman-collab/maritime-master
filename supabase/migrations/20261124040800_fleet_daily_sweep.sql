-- =================================================================
-- FLEET OPERATIONS X5-09: the fleet daily sweep (gap/02 FD7 automatic
-- reminders, X4 notifications with deep links, TR1 stale applications
-- digest, W1 and W3 notifications; DECISIONS D-01, D-55, D-120, D-128,
-- D-162, D-232, D-238, D-239, D-249; X5 spec §2 X5-09; D-X5-04,
-- D-X5-24; platform-prep plan contract 10, PP4 / PR-09)
-- Function (service role): fleet_ops_daily_sweep(p_today date DEFAULT
--   current_date) RETURNS jsonb, run once a day by hr-daily-sweeper after
--   the platform and hr_* sweeps (it is already in SWEEPS; docs/JOBS.md
--   row 11); pure copy helpers fleet_ops_sweep_fit, fleet_ops_sweep_list
-- Emits: fleet_document_ack_due_soon, fleet_document_ack_overdue,
--   fleet_document_ack_digest (category Documents) and
--   training_applications_stale (category Training), seeded by
--   20261124030100; their manifests (documents/module.ts,
--   development/module.ts) declare them live
-- Reads: fleet_document_ack_rows() (20261124040400, the one acknowledgement
--   state core: no state logic here), fleet_document_reminders (the
--   24-hour rule and the log), development_applications.stage_entered_at
--   (20261124040600)
-- TS mirror: none (no client code; the sweep is service-only)
-- =================================================================
--
-- The sweep is judged at the start of the day it runs for (v_now = p_today
-- 00:00 UTC), in UTC days like the due dates it reads (D-X5-04), so a run
-- at any hour of the day gives the same answer and a test can name a day.
--
-- (1) Fleet document acknowledgements, per company with published
--     documents that need one, from one snapshot of fleet_document_ack_rows
--     (company, every document, every vessel, v_now):
--   due soon   pending rows (a login, in the signer set, not acknowledged)
--              whose due day is p_today + 3 (due_at - 3 days is today), of a
--              version published before the day began (a version published
--              today has just sent its own fleet_document_published).
--              One fleet_document_ack_due_soon per document version x
--              vessel, the people's logins as must-act users, link
--              safety/fleet-documents?doc=<document> on the vessel (module
--              safety). Dedupe fleet_document_ack_due_soon:<version>:
--              <vessel>:<day>.
--   overdue    overdue rows whose due day is in the last seven days
--              (p_today - 7 .. p_today - 1: they became overdue since the
--              last runs, so one missed run loses nothing) and who have not
--              had an overdue notice for this version on this vessel (the
--              log: kind overdue, sent since the version was published). Per
--              document version x vessel: one fleet_document_ack_overdue to
--              the people (link ?doc=<document>), then one to each of their
--              officers: the vessel's Master (record_is_master) for everyone
--              but themselves, and each head of department covering a
--              person's department (fleet_hod_covers), naming up to three
--              of the people they cover (link safety/fleet-documents?view=
--              crew, the crew view). Dedupe fleet_document_ack_overdue:
--              <version>:<vessel>:<day> (and :<officer login> for each
--              officer's copy).
--   24 hours   one reminder per person per document per 24 hours, whatever
--              its kind (the rule fleet_document_remind() applies, D-X5-05A):
--              someone reminded in the last 24 hours (manual or automatic) is
--              held back. A held due-soon person is not reminded again that
--              day (they were reminded within the day); a held overdue
--              person is deferred, so their notice and their officers' come
--              with a later run of the seven-day window. Held people are
--              counted in the log row's skipped_count.
--   digest     on Mondays: one fleet_document_ack_digest to the company's
--              documents editors with fleet reach (fleet_ops_can_for
--              documents edit, NULL vessel: active, not external) with the
--              overdue acknowledgements as of the start of the day, by
--              vessel (link documents?tab=acknowledgements in the Fleet
--              scope), only when something is overdue. Dedupe
--              fleet_document_ack_digest:<day>.
--   log        each send is logged in fleet_document_reminders (sent_by
--              NULL): due_soon and overdue rows name the vessel and the
--              people reminded (recipient_profile_ids, which the 24-hour
--              rule and the Remind dialogs read); a digest writes one row
--              per document it reports, vessel NULL, naming no crew profile
--              (the digest goes to the editors; their logins are on the
--              notification), so the 24-hour rule never counts it.
--
-- (2) Training applications (TR1, W3 "stale applications"), on Mondays, per
--     company: applications waiting for an approval (submitted, hod_review,
--     captain_purser_review, purser_review, captain_review) for more than 7
--     days at one stage, counted from stage_entered_at (rows written
--     before 20261124040600: submitted_at, then updated_at, then
--     created_at; the lib/applicationMachine.ts stageEnteredAt rule) to the
--     start of the day. One training_applications_stale to the company's
--     training admins (fleet_ops_can_for training admin, NULL vessel), link
--     training/overview in the Fleet scope (the "Awaiting approval > 7
--     days" list), naming the three longest waiting with the stage they
--     wait at. Dedupe training_applications_stale:<day>. Drafts, returned,
--     approved and later, and voided applications are never stale.
--
-- Not here: the TH5 status-request emitters (status_request_due /
-- status_request_overdue) are the platform's engine job (PR-14, D-238,
-- D-X5-24); scheduling the sweeper and docs/JOBS.md are PR-09 (done).
--
-- Notifications (D-128, D-162, D-238, D-249): every emit sits in its own
-- BEGIN ... EXCEPTION block; a refused emit (a type that is not seeded, a
-- vessel without a code, ...) raises a WARNING, is counted in `skipped` and
-- never stops the sweep or rolls back the other sends. A vessel whose
-- Safety module is off follows emit_notification_event's rule (the event
-- is recorded and fans out to nobody); the fleet digests are not module
-- gated. A second run the same day sends nothing new: every send checks
-- its dedupe key first, and the log keeps the overdue notices once per
-- version. In-app only: no copy here sends or promises an email (D-249).
--
-- Concurrency: one sweep at a time (a transaction advisory lock), and the
-- per-document lock fleet_document_remind() takes, so a manual reminder and
-- the sweep never both pass the 24-hour rule for the same person.
--
-- Returns {documents_due_soon, documents_overdue, digests, training_stale,
-- skipped}: the notifications emitted per branch (the overdue count
-- includes the officers' copies; digests is the documents digests) and the
-- notifications that were due but refused.
--
-- Security: SECURITY DEFINER, search_path set, EXECUTE for service_role
-- only (REVOKE from PUBLIC, anon, authenticated); it takes no ids, refuses
-- a signed-in caller (42501 sweep_service_only) and a day more than 7 days
-- from today (22023 sweep_day_out_of_range).
--
-- Nothing here is live (D-01): hr-daily-sweeper reads 'not applied' for it
-- until this file is applied (D-232, D-239). Applying it changes no table,
-- policy or function users have today.
--
-- Idempotent (D-12, D-55): one CREATE OR REPLACE FUNCTION, grants and a
-- comment.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.fleet_document_ack_rows(uuid,uuid,uuid[],timestamptz)') IS NULL
     OR to_regclass('public.fleet_document_reminders') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040800_fleet_daily_sweep needs the fleet document acknowledgements: apply 20261124040400_fleet_documents_acknowledgements.sql first';
  END IF;
  IF to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL OR to_regprocedure('public.fleet_hod_covers(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040800_fleet_daily_sweep needs the fleet access helpers: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'development_applications' AND column_name = 'stage_entered_at') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040800_fleet_daily_sweep needs development_applications.stage_entered_at: apply 20261124040600_fleet_training_core.sql first';
  END IF;
  IF to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040800_fleet_daily_sweep needs record_is_master(): apply 20261123020100_platform_record_signatures.sql first';
  END IF;
  IF to_regprocedure('public.emit_notification_event(text,uuid,text,text,uuid,text,text,text,text,text,uuid,text,uuid,uuid[],text[],jsonb,text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040800_fleet_daily_sweep needs the notification outbox: apply 20261123030000_platform_notification_outbox.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- copy helpers (pure, service role)

-- p_text cut to p_max characters with an ellipsis, never mid-way without one.
CREATE OR REPLACE FUNCTION public.fleet_ops_sweep_fit(p_text text, p_max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_text IS NULL OR length(p_text) <= p_max THEN p_text ELSE rtrim(left(p_text, p_max - 1)) || '…' END
$$;

-- A notification body that names a list: p_prefix, the first k items of p_items (a jsonb array of
-- text) joined by p_sep, "and n more" (p_more, a format with one %s) when p_total > k, then
-- p_suffix; k is the most items (up to all of them) that keep the body within 280 characters
-- (the outbox CHECK), so the closing sentence always survives. Cut with an ellipsis only when even
-- one item does not fit.
CREATE OR REPLACE FUNCTION public.fleet_ops_sweep_list(p_prefix text, p_items jsonb, p_sep text, p_total integer, p_more text, p_suffix text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_count integer := CASE WHEN jsonb_typeof(p_items) = 'array' THEN jsonb_array_length(p_items) ELSE 0 END;
  v_body text;
BEGIN
  FOR k IN REVERSE v_count..1 LOOP
    SELECT coalesce(p_prefix, '') || string_agg(t.e, p_sep ORDER BY t.ord)
           || CASE WHEN coalesce(p_total, v_count) > k THEN format(p_more, coalesce(p_total, v_count) - k) ELSE '' END
           || coalesce(p_suffix, '')
      INTO v_body
    FROM jsonb_array_elements_text(p_items) WITH ORDINALITY AS t(e, ord)
    WHERE t.ord <= k;
    IF length(v_body) <= 280 THEN
      RETURN v_body;
    END IF;
  END LOOP;
  RETURN public.fleet_ops_sweep_fit(coalesce(v_body, coalesce(p_prefix, '') || coalesce(p_suffix, '')), 280);
END;
$$;

-- ---------------------------------------------------------------- the sweep

CREATE OR REPLACE FUNCTION public.fleet_ops_daily_sweep(p_today date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utc_today date := (now() AT TIME ZONE 'UTC')::date;
  v_today date := coalesce(p_today, (now() AT TIME ZONE 'UTC')::date);
  v_now timestamptz;
  v_day text;
  v_monday boolean;
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_due_soon integer := 0;
  v_overdue integer := 0;
  v_digests integer := 0;
  v_training integer := 0;
  v_skipped integer := 0;
  v_company uuid;
  v_rows jsonb;
  v_officers jsonb;
  v_key text;
  v_ok boolean;
  v_title text;
  v_body text;
  v_users uuid[];
  v_total integer;
  v_vessel_count integer;
  v_payload jsonb;
  v_documents uuid[];
  v_names jsonb;
  g record;
  o record;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sweep_service_only', DETAIL = 'The fleet daily sweep runs as the service (hr-daily-sweeper), never as a signed-in user.';
  END IF;
  IF abs(v_today - v_utc_today) > 7 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sweep_day_out_of_range', DETAIL = 'The day must be within 7 days of today (UTC).';
  END IF;
  v_now := v_today::timestamp AT TIME ZONE 'UTC';
  v_day := to_char(v_today, 'YYYY-MM-DD');
  v_monday := extract(isodow FROM v_today) = 1;
  PERFORM pg_advisory_xact_lock(hashtext('fleet_ops_daily_sweep'));

  -- ---------------------------------------------------------- (1) fleet document acknowledgements
  FOR v_company IN
    SELECT DISTINCT d.company_id FROM public.fleet_documents AS d
    WHERE d.status = 'published' AND d.ack_required AND d.current_version_id IS NOT NULL
    ORDER BY 1
  LOOP
    -- The lock fleet_document_remind() takes, per document, before the 24-hour rule is read.
    PERFORM pg_advisory_xact_lock(hashtext('fleet_document_remind:' || x.id::text))
    FROM (SELECT d.id FROM public.fleet_documents AS d
          WHERE d.company_id = v_company AND d.status = 'published' AND d.ack_required ORDER BY d.id) AS x;

    -- One snapshot of the state core: the outstanding rows of the company at the start of the day.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'document_id', x.document_id, 'version_id', x.version_id, 'vessel_id', x.vessel_id, 'profile_id', x.profile_id,
             'user_id', x.user_id, 'department', x.department, 'person_name', x.person_name, 'state', x.state, 'due_at', x.due_at)
             ORDER BY x.document_id, x.vessel_id, x.profile_id), '[]'::jsonb)
      INTO v_rows
    FROM public.fleet_document_ack_rows(v_company, NULL, NULL, v_now) AS x
    WHERE x.on_crew AND x.state IN ('pending', 'overdue') AND x.user_id IS NOT NULL;

    -- (1a) due in three days
    FOR g IN
      WITH r AS (
        SELECT * FROM jsonb_to_recordset(v_rows) AS x(document_id uuid, version_id uuid, vessel_id uuid, profile_id uuid, user_id uuid,
                                                     department text, person_name text, state text, due_at timestamptz)
      ),
      due AS (
        SELECT r.*, EXISTS (
                 SELECT 1 FROM public.fleet_document_reminders AS fr
                 WHERE fr.document_id = r.document_id AND fr.sent_at > now() - interval '24 hours'
                   AND r.profile_id = ANY (fr.recipient_profile_ids)) AS held
        FROM r
        WHERE r.state = 'pending' AND (r.due_at AT TIME ZONE 'UTC')::date = v_today + 3
      )
      SELECT du.document_id, du.version_id, du.vessel_id, d.title, ver.version_label,
             array_agg(du.profile_id ORDER BY du.profile_id) FILTER (WHERE NOT du.held) AS profiles,
             array_agg(DISTINCT du.user_id) FILTER (WHERE NOT du.held) AS users,
             (count(*) FILTER (WHERE du.held))::integer AS held
      FROM due AS du
      JOIN public.fleet_documents AS d ON d.id = du.document_id
      JOIN public.fleet_document_versions AS ver ON ver.id = du.version_id
      WHERE ver.published_at < v_now
      GROUP BY du.document_id, du.version_id, du.vessel_id, d.title, ver.version_label
      ORDER BY du.document_id, du.vessel_id
    LOOP
      CONTINUE WHEN g.profiles IS NULL;
      v_key := format('fleet_document_ack_due_soon:%s:%s:%s', g.version_id, g.vessel_id, v_day);
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.notification_outbox AS ob WHERE ob.company_id = v_company AND ob.dedupe_key = v_key);
      BEGIN
        PERFORM public.emit_notification_event(
          p_type_key => 'fleet_document_ack_due_soon',
          p_company_id => v_company,
          p_title => public.fleet_ops_sweep_fit('Acknowledgement due in three days: ' || g.title, 120),
          p_link_scope => 'vessel',
          p_vessel_id => g.vessel_id,
          p_body => 'Due on ' || to_char(v_today + 3, 'DD Mon YYYY') || '. Open it in Safety, Fleet documents, read it and acknowledge it.',
          p_severity => 'info',
          p_link_path => 'safety/fleet-documents?doc=' || g.document_id::text,
          p_record_id => g.document_id,
          p_record_ref => g.version_label,
          p_must_act_user_ids => g.users,
          p_payload => jsonb_build_object('document_id', g.document_id, 'version_id', g.version_id, 'due_on', v_today + 3),
          p_dedupe_key => v_key,
          p_module_key => 'safety');
        v_ok := true;
      EXCEPTION WHEN others THEN
        v_ok := false;
        RAISE WARNING 'fleet_ops_daily_sweep: fleet_document_ack_due_soon not sent for document % vessel % (%): %', g.document_id, g.vessel_id, SQLSTATE, SQLERRM;
      END;
      IF v_ok THEN
        v_due_soon := v_due_soon + 1;
        PERFORM set_config('storm.fleet_tx', 'on', true);
        INSERT INTO public.fleet_document_reminders (company_id, document_id, vessel_id, profile_id, kind, sent_by, recipient_count, skipped_count, recipient_profile_ids)
        VALUES (v_company, g.document_id, g.vessel_id, NULL, 'due_soon', NULL, cardinality(g.profiles), g.held, g.profiles);
        PERFORM set_config('storm.fleet_tx', v_prev, true);
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END LOOP;

    -- (1b) became overdue (the last seven days), once per person, version and vessel
    FOR g IN
      WITH r AS (
        SELECT * FROM jsonb_to_recordset(v_rows) AS x(document_id uuid, version_id uuid, vessel_id uuid, profile_id uuid, user_id uuid,
                                                     department text, person_name text, state text, due_at timestamptz)
      ),
      od AS (
        SELECT r.*, EXISTS (
                 SELECT 1 FROM public.fleet_document_reminders AS fr
                 WHERE fr.document_id = r.document_id AND fr.sent_at > now() - interval '24 hours'
                   AND r.profile_id = ANY (fr.recipient_profile_ids)) AS held
        FROM r
        JOIN public.fleet_document_versions AS ver ON ver.id = r.version_id
        WHERE r.state = 'overdue'
          AND (r.due_at AT TIME ZONE 'UTC')::date BETWEEN v_today - 7 AND v_today - 1
          AND NOT EXISTS (
                SELECT 1 FROM public.fleet_document_reminders AS fr
                WHERE fr.document_id = r.document_id AND fr.vessel_id = r.vessel_id AND fr.kind = 'overdue'
                  AND fr.sent_at >= ver.published_at AND r.profile_id = ANY (fr.recipient_profile_ids))
      )
      SELECT o2.document_id, o2.version_id, o2.vessel_id, d.title, ver.version_label,
             array_agg(o2.profile_id ORDER BY o2.profile_id) FILTER (WHERE NOT o2.held) AS profiles,
             array_agg(DISTINCT o2.user_id) FILTER (WHERE NOT o2.held) AS users,
             jsonb_agg(jsonb_build_object('profile_id', o2.profile_id, 'user_id', o2.user_id, 'department', o2.department,
                                          'person_name', coalesce(o2.person_name, 'A crew member'))
                       ORDER BY o2.person_name NULLS LAST, o2.profile_id) FILTER (WHERE NOT o2.held) AS people,
             (count(*) FILTER (WHERE o2.held))::integer AS held
      FROM od AS o2
      JOIN public.fleet_documents AS d ON d.id = o2.document_id
      JOIN public.fleet_document_versions AS ver ON ver.id = o2.version_id
      GROUP BY o2.document_id, o2.version_id, o2.vessel_id, d.title, ver.version_label
      ORDER BY o2.document_id, o2.vessel_id
    LOOP
      CONTINUE WHEN g.profiles IS NULL;
      v_key := format('fleet_document_ack_overdue:%s:%s:%s', g.version_id, g.vessel_id, v_day);
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.notification_outbox AS ob WHERE ob.company_id = v_company AND ob.dedupe_key = v_key);

      -- The officers of these people on the vessel: the Master for everyone but themselves, a head of
      -- department for the people of the departments they cover; up to three names each.
      SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', oc.user_id, 'n', oc.n, 'names', oc.names) ORDER BY oc.user_id), '[]'::jsonb)
        INTO v_officers
      FROM (
        WITH people AS (
          SELECT * FROM jsonb_to_recordset(g.people) AS p(profile_id uuid, user_id uuid, department text, person_name text)
        ),
        candidates AS (
          SELECT ca.user_id, true AS is_master
          FROM public.crew_assignments AS ca
          WHERE ca.vessel_id = g.vessel_id AND ca.is_current AND ca.user_id IS NOT NULL
            AND coalesce(public.record_is_master(ca.user_id, g.vessel_id), false)
          UNION
          SELECT ur.user_id, false
          FROM public.user_roles AS ur
          WHERE ur.role::text = 'hod' AND coalesce(ur.is_active, false) AND (ur.expires_at IS NULL OR ur.expires_at > now())
            AND (ur.vessel_id = g.vessel_id OR (ur.vessel_id IS NULL AND ur.company_id = v_company))
        ),
        officers AS (
          SELECT c.user_id, bool_or(c.is_master) AS is_master FROM candidates AS c GROUP BY c.user_id
        )
        SELECT f.user_id, count(*)::integer AS n,
               to_jsonb((array_agg(pe.person_name ORDER BY pe.person_name, pe.profile_id))[1:3]) AS names
        FROM officers AS f
        JOIN people AS pe ON pe.user_id IS DISTINCT FROM f.user_id
                         AND (f.is_master OR coalesce(public.fleet_hod_covers(f.user_id, g.vessel_id, pe.department), false))
        GROUP BY f.user_id
      ) AS oc;

      BEGIN
        PERFORM public.emit_notification_event(
          p_type_key => 'fleet_document_ack_overdue',
          p_company_id => v_company,
          p_title => public.fleet_ops_sweep_fit('Acknowledgement overdue: ' || g.title, 120),
          p_link_scope => 'vessel',
          p_vessel_id => g.vessel_id,
          p_body => 'It is past its due date. Open it in Safety, Fleet documents, read it and acknowledge it.',
          p_severity => 'warning',
          p_link_path => 'safety/fleet-documents?doc=' || g.document_id::text,
          p_record_id => g.document_id,
          p_record_ref => g.version_label,
          p_must_act_user_ids => g.users,
          p_payload => jsonb_build_object('document_id', g.document_id, 'version_id', g.version_id),
          p_dedupe_key => v_key,
          p_module_key => 'safety');
        v_ok := true;
      EXCEPTION WHEN others THEN
        v_ok := false;
        RAISE WARNING 'fleet_ops_daily_sweep: fleet_document_ack_overdue not sent for document % vessel % (%): %', g.document_id, g.vessel_id, SQLSTATE, SQLERRM;
      END;
      IF NOT v_ok THEN
        -- Nothing is logged, so the people (and their officers) come with the next run of the window.
        v_skipped := v_skipped + 1 + jsonb_array_length(v_officers);
        CONTINUE;
      END IF;
      v_overdue := v_overdue + 1;
      PERFORM set_config('storm.fleet_tx', 'on', true);
      INSERT INTO public.fleet_document_reminders (company_id, document_id, vessel_id, profile_id, kind, sent_by, recipient_count, skipped_count, recipient_profile_ids)
      VALUES (v_company, g.document_id, g.vessel_id, NULL, 'overdue', NULL, cardinality(g.profiles), g.held, g.profiles);
      PERFORM set_config('storm.fleet_tx', v_prev, true);

      FOR o IN SELECT * FROM jsonb_to_recordset(v_officers) AS x(user_id uuid, n integer, names jsonb) ORDER BY x.user_id
      LOOP
        v_body := public.fleet_ops_sweep_list('Not acknowledged yet: ', o.names, ', ', o.n, ' and %s more',
                                              '. Open the crew view in Safety, Fleet documents to remind them or record a witnessed acknowledgement.');
        BEGIN
          PERFORM public.emit_notification_event(
            p_type_key => 'fleet_document_ack_overdue',
            p_company_id => v_company,
            p_title => public.fleet_ops_sweep_fit('Crew acknowledgement overdue: ' || g.title, 120),
            p_link_scope => 'vessel',
            p_vessel_id => g.vessel_id,
            p_body => v_body,
            p_severity => 'warning',
            p_link_path => 'safety/fleet-documents?view=crew',
            p_record_id => g.document_id,
            p_record_ref => g.version_label,
            p_must_act_user_ids => ARRAY[o.user_id],
            p_payload => jsonb_build_object('document_id', g.document_id, 'version_id', g.version_id, 'overdue', o.n),
            p_dedupe_key => v_key || ':' || o.user_id::text,
            p_module_key => 'safety');
          v_overdue := v_overdue + 1;
        EXCEPTION WHEN others THEN
          v_skipped := v_skipped + 1;
          RAISE WARNING 'fleet_ops_daily_sweep: fleet_document_ack_overdue (officer) not sent for document % vessel % (%): %', g.document_id, g.vessel_id, SQLSTATE, SQLERRM;
        END;
      END LOOP;
    END LOOP;

    -- (1c) Mondays: the overdue digest to the documents editors
    IF v_monday THEN
      v_key := 'fleet_document_ack_digest:' || v_day;
      IF NOT EXISTS (SELECT 1 FROM public.notification_outbox AS ob WHERE ob.company_id = v_company AND ob.dedupe_key = v_key) THEN
        WITH r AS (
          SELECT * FROM jsonb_to_recordset(v_rows) AS x(document_id uuid, vessel_id uuid, profile_id uuid, state text)
        ),
        per AS (
          SELECT r.vessel_id, count(*)::integer AS overdue, count(DISTINCT r.profile_id)::integer AS people
          FROM r WHERE r.state = 'overdue' GROUP BY r.vessel_id
        ),
        ranked AS (
          SELECT per.*, ve.name, ve.code, row_number() OVER (ORDER BY per.overdue DESC, ve.name, ve.id) AS rn
          FROM per JOIN public.vessels AS ve ON ve.id = per.vessel_id
        )
        SELECT coalesce(sum(k.overdue), 0)::integer, count(*)::integer,
               coalesce(jsonb_agg(k.name || ' ' || k.overdue ORDER BY k.rn) FILTER (WHERE k.rn <= 5), '[]'::jsonb),
               coalesce(jsonb_agg(jsonb_build_object('vessel_id', k.vessel_id, 'vessel_code', k.code, 'overdue', k.overdue, 'people', k.people)
                                  ORDER BY k.rn) FILTER (WHERE k.rn <= 50), '[]'::jsonb)
          INTO v_total, v_vessel_count, v_names, v_payload
        FROM ranked AS k;
        SELECT coalesce(array_agg(DISTINCT x.document_id ORDER BY x.document_id), '{}'::uuid[]) INTO v_documents
        FROM jsonb_to_recordset(v_rows) AS x(document_id uuid, state text) WHERE x.state = 'overdue';
        SELECT coalesce(array_agg(DISTINCT p.user_id ORDER BY p.user_id), '{}'::uuid[]) INTO v_users
        FROM public.profiles AS p
        WHERE p.company_id = v_company AND p.user_id IS NOT NULL
          AND coalesce(public.fleet_ops_can_for(p.user_id, v_company, NULL, 'documents', 'edit'), false);

        IF v_total > 0 AND cardinality(v_users) > 0 THEN
          v_title := CASE WHEN v_total = 1 THEN '1 overdue acknowledgement' ELSE v_total || ' overdue acknowledgements' END
                     || CASE WHEN v_vessel_count = 1 THEN ' on 1 vessel' ELSE ' on ' || v_vessel_count || ' vessels' END;
          v_body := public.fleet_ops_sweep_list('', v_names, ', ', v_vessel_count, ' and %s more',
                                                '. Open Documents, Acknowledgements to see who is overdue and remind them.');
          BEGIN
            PERFORM public.emit_notification_event(
              p_type_key => 'fleet_document_ack_digest',
              p_company_id => v_company,
              p_title => v_title,
              p_link_scope => 'fleet',
              p_body => v_body,
              p_severity => 'info',
              p_link_path => 'documents?tab=acknowledgements',
              p_must_act_user_ids => v_users,
              p_payload => jsonb_build_object('overdue', v_total, 'vessel_count', v_vessel_count, 'vessels', v_payload, 'as_of', v_now),
              p_dedupe_key => v_key);
            v_ok := true;
          EXCEPTION WHEN others THEN
            v_ok := false;
            RAISE WARNING 'fleet_ops_daily_sweep: fleet_document_ack_digest not sent for company % (%): %', v_company, SQLSTATE, SQLERRM;
          END;
          IF v_ok THEN
            v_digests := v_digests + 1;
            PERFORM set_config('storm.fleet_tx', 'on', true);
            INSERT INTO public.fleet_document_reminders (company_id, document_id, vessel_id, profile_id, kind, sent_by, recipient_count, skipped_count, recipient_profile_ids)
            SELECT v_company, doc.id, NULL, NULL, 'digest', NULL, 0, 0, '{}'::uuid[]
            FROM unnest(v_documents) AS doc(id);
            PERFORM set_config('storm.fleet_tx', v_prev, true);
          ELSE
            v_skipped := v_skipped + 1;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------- (2) Mondays: training applications waiting more than 7 days
  IF v_monday THEN
    FOR v_company IN
      SELECT DISTINCT a.company_id FROM public.development_applications AS a
      WHERE a.status IN ('submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review')
        AND coalesce(a.stage_entered_at, a.submitted_at, a.updated_at, a.created_at) < v_now - interval '7 days'
      ORDER BY 1
    LOOP
      v_key := 'training_applications_stale:' || v_day;
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.notification_outbox AS ob WHERE ob.company_id = v_company AND ob.dedupe_key = v_key);
      SELECT coalesce(array_agg(DISTINCT p.user_id ORDER BY p.user_id), '{}'::uuid[]) INTO v_users
      FROM public.profiles AS p
      WHERE p.company_id = v_company AND p.user_id IS NOT NULL
        AND coalesce(public.fleet_ops_can_for(p.user_id, v_company, NULL, 'training', 'admin'), false);
      CONTINUE WHEN cardinality(v_users) = 0;

      WITH s AS (
        SELECT a.id, a.application_number, a.course_name, a.status,
               floor(extract(epoch FROM (v_now - coalesce(a.stage_entered_at, a.submitted_at, a.updated_at, a.created_at))) / 86400)::integer AS days,
               CASE WHEN a.status IN ('submitted', 'hod_review') THEN 'with the head of department' ELSE 'at the final approval' END AS stage,
               row_number() OVER (ORDER BY coalesce(a.stage_entered_at, a.submitted_at, a.updated_at, a.created_at), a.application_number, a.id) AS rn
        FROM public.development_applications AS a
        WHERE a.company_id = v_company
          AND a.status IN ('submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review')
          AND coalesce(a.stage_entered_at, a.submitted_at, a.updated_at, a.created_at) < v_now - interval '7 days'
      )
      SELECT count(*)::integer,
             coalesce(jsonb_agg(concat_ws(' ', nullif(btrim(coalesce(s.application_number, '')), ''), public.fleet_ops_sweep_fit(coalesce(s.course_name, 'A course'), 60))
                                || format(', %s days %s', s.days, s.stage) ORDER BY s.rn) FILTER (WHERE s.rn <= 3), '[]'::jsonb),
             coalesce(jsonb_agg(jsonb_build_object('application_id', s.id, 'application_number', s.application_number, 'status', s.status,
                                                   'waiting_days', s.days) ORDER BY s.rn) FILTER (WHERE s.rn <= 20), '[]'::jsonb)
        INTO v_total, v_names, v_payload
      FROM s;
      CONTINUE WHEN coalesce(v_total, 0) = 0;

      v_title := CASE WHEN v_total = 1 THEN '1 training application waiting more than 7 days'
                      ELSE v_total || ' training applications waiting more than 7 days' END;
      v_body := public.fleet_ops_sweep_list('Longest waiting: ', v_names, '; ', v_total, '; and %s more', '. Open Training to follow them up.');
      BEGIN
        PERFORM public.emit_notification_event(
          p_type_key => 'training_applications_stale',
          p_company_id => v_company,
          p_title => v_title,
          p_link_scope => 'fleet',
          p_body => v_body,
          p_severity => 'info',
          p_link_path => 'training/overview',
          p_must_act_user_ids => v_users,
          p_payload => jsonb_build_object('stale', v_total, 'applications', v_payload, 'as_of', v_now),
          p_dedupe_key => v_key);
        v_training := v_training + 1;
      EXCEPTION WHEN others THEN
        v_skipped := v_skipped + 1;
        RAISE WARNING 'fleet_ops_daily_sweep: training_applications_stale not sent for company % (%): %', v_company, SQLSTATE, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'documents_due_soon', v_due_soon,
    'documents_overdue', v_overdue,
    'digests', v_digests,
    'training_stale', v_training,
    'skipped', v_skipped);
END;
$$;

-- ---------------------------------------------------------------- grants

REVOKE ALL ON FUNCTION public.fleet_ops_daily_sweep(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_ops_sweep_fit(text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_ops_sweep_list(text, jsonb, text, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fleet_ops_daily_sweep(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_ops_sweep_fit(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_ops_sweep_list(text, jsonb, text, integer, text, text) TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.fleet_ops_sweep_fit(text, integer) IS 'Pure (fleet daily sweep copy): the text cut to the length with an ellipsis. Service role only.';
COMMENT ON FUNCTION public.fleet_ops_sweep_list(text, jsonb, text, integer, text, text) IS 'Pure (fleet daily sweep copy): prefix, as many of the list items as fit, "and n more", suffix, within the 280-character notification body. Service role only.';

COMMENT ON FUNCTION public.fleet_ops_daily_sweep(date) IS 'The fleet daily sweep (gap/02 FD7, X4, TR1; hr-daily-sweeper, D-232; service role only). Judged at p_today 00:00 UTC from fleet_document_ack_rows: fleet_document_ack_due_soon to the people whose acknowledgement is due in three days (per document version x vessel); fleet_document_ack_overdue to the people who became overdue in the last seven days (once per version and vessel, from the reminder log) and to their Master and heads of department (the crew view); on Mondays fleet_document_ack_digest to the documents editors (overdue by vessel) and training_applications_stale to the training admins (awaiting approval more than 7 days at one stage). One reminder per person per document per 24 hours (held back otherwise); each send logged in fleet_document_reminders; dedupe per day; every emit guarded (a refused one counted in skipped, D-128). Returns {documents_due_soon, documents_overdue, digests, training_stale, skipped}.';
