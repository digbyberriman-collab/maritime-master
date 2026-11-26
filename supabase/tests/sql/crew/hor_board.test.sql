-- The vessel hours-of-rest board, breach review, reminders and breach
-- report (X1-08, 20261124060800_crew_hor_board.sql; gap/04 C40, C41, C42,
-- C43, C45, W6; DECISIONS D-128, D-X1-14, D-X1-20, D-X1-23; T-142, T-144):
--   1. the schema: tables with RLS, the partial uniques, the security-invoker
--      review view, no browser write policy;
--   2. the board: membership by any day of the month (a transferred-out
--      person stays on the origin board, and is on the new vessel's),
--      former crew, on leave all month, expected / missing days, leave
--      days, the Hours of Rest start date (C45), the department and the
--      caller facts; gates (crew, no rights, inactive, another tenant,
--      anonymous, unknown vessel, a future month);
--   3. the breach list: deficit, serious first, open only, who may review
--      which, the range rules;
--   4. the review: accepted needs a justification, own breach, another
--      department, correction_requested reopens the month through the
--      engine (stale signatures, audit, hor_correction_requested), dismissed
--      only after a correction, a pending correction blocks approval,
--      reopening an approved month needs the final approver, superseded and
--      reported breaches, direct writes refused;
--   5. reminders: ids outside the board refused, the daily rate limit,
--      months already submitted skipped, the log with the sender's role,
--      hor_reminder, the reminder log's RLS;
--   6. the daily sweep: the 1st, the sign-off day, before the cut-off, once
--      per kind, vessels with automatic reminders off, inactive people;
--   7. the breach report: recipients (fleet HR, DPA), refused for an
--      unreviewed breach, a non-HR recipient, another vessel's breach, out
--      of the period, reported twice; flags and hor_breach_report; RLS;
--   8. the serious-breach trigger emits outbox rows to the Master and
--      fleet HR, once per person, rule and day;
--   9. the month statistics;
--  10. a 60-crew board month under 500 ms;
--  11. grants and the live emitters (D-238).

SELECT tests.seed_two_tenants();

SELECT (date_trunc('month', current_date) - interval '1 month')::date AS pm1,
       (date_trunc('month', current_date) - interval '1 day')::date AS pm_last,
       date_trunc('month', current_date)::date AS cm1,
       extract(year FROM date_trunc('month', current_date) - interval '1 month')::integer AS pm_y,
       extract(month FROM date_trunc('month', current_date) - interval '1 month')::integer AS pm_m,
       extract(day FROM date_trunc('month', current_date) - interval '1 day')::integer AS pm_days,
       extract(year FROM current_date)::integer AS cm_y,
       extract(month FROM current_date)::integer AS cm_m,
       extract(year FROM date_trunc('month', current_date) + interval '1 month')::integer AS nm_y,
       extract(month FROM date_trunc('month', current_date) + interval '1 month')::integer AS nm_m
\gset

-- ------------------------------------------------------------ world (A.dra unless named)

CREATE OR REPLACE FUNCTION pg_temp.crew(p_key text, p_vessel text, p_title text, p_extra jsonb DEFAULT '{}'::jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tests.seed_user(split_part(p_key, '.', 1), p_key, 'crew');
  PERFORM tests.seed_assignment(p_key, p_vessel, true, p_title, jsonb_build_object('join_date', current_date - 150) || p_extra);
END;
$$;
SELECT pg_temp.crew('A.x18_deck', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x18_stew', 'A.dra', 'Second Stew');
SELECT pg_temp.crew('A.x18_chief_officer', 'A.dra', 'Chief Officer');
SELECT pg_temp.crew('A.x18_chief_stew', 'A.dra', 'Chief Stew');
SELECT pg_temp.crew('A.x18_viewer', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x18_leave', 'A.dra', 'Deckhand');
SELECT pg_temp.crew('A.x18_gone', 'A.dra', 'Deckhand', jsonb_build_object('leave_date', current_date - 5, 'is_current', false));
SELECT pg_temp.crew('A.x18_signoff', 'A.dra', 'Deckhand', jsonb_build_object('leave_date', date_trunc('month', current_date)::date + 1));
SELECT tests.seed_user('A', 'A.x18_transfer', 'crew');
SELECT tests.seed_assignment('A.x18_transfer', 'A.dra', false, 'Deckhand',
  jsonb_build_object('join_date', current_date - 150, 'leave_date', :'pm1'::date + 14, 'is_current', false));
SELECT tests.seed_assignment('A.x18_transfer', 'A.hyd', true, 'Deckhand', jsonb_build_object('join_date', :'pm1'::date + 15));
SELECT tests.seed_user('A', 'A.x18_hr', 'shore_management');
UPDATE public.crew_assignments SET join_date = current_date - 150 WHERE id = tests.id('assignment:A.crew_hyd@A.hyd');
UPDATE public.crew_assignments SET join_date = current_date - 150 WHERE id = tests.id('assignment:A.master_dra@A.dra');
SELECT tests.seed_assignment('A.disabled', 'A.dra', true, 'Deckhand', jsonb_build_object('join_date', current_date - 150));
SELECT tests.seed_user('B', 'B.x18_crew', 'crew');
SELECT tests.seed_assignment('B.x18_crew', 'B.lev', true, 'Deckhand', jsonb_build_object('join_date', current_date - 150));

SELECT tests.seed_role('x18_crew', 'vessel');
SELECT tests.seed_role('x18_hod', 'vessel');
SELECT tests.seed_role('x18_master', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.k, x.p::public.permission_level, 'vessel'
FROM (VALUES ('x18_crew', 'crew_roster', 'view'),
             ('x18_hod', 'crew_roster', 'edit'), ('x18_hod', 'crew.approve_hours_of_rest', 'view'),
             ('x18_master', 'crew_roster', 'admin')) AS x(r, k, p)
JOIN public.roles AS r ON r.name = x.r;
SELECT tests.seed_rbac_role(k, 'x18_crew', 'A.dra')
FROM unnest(ARRAY['A.x18_deck', 'A.x18_stew', 'A.x18_leave', 'A.x18_gone', 'A.x18_signoff', 'A.x18_transfer', 'A.disabled']) AS k;
SELECT tests.seed_rbac_role('A.x18_transfer', 'x18_crew', 'A.hyd');
SELECT tests.seed_rbac_role('A.crew_hyd', 'x18_crew', 'A.hyd');
SELECT tests.seed_rbac_role('B.x18_crew', 'x18_crew', 'B.lev');
SELECT tests.seed_rbac_role(k, 'x18_hod', 'A.dra') FROM unnest(ARRAY['A.x18_chief_stew', 'A.x18_chief_officer']) AS k;
SELECT tests.seed_rbac_role('A.master_dra', 'x18_master', 'A.dra');

-- Leave: the stew on the 3rd and 4th; one deckhand every day of the month.
INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id, vessel_id)
SELECT tests.user_id('A.x18_stew'), :'pm1'::date + d, 'L', tests.company_id('A'), tests.vessel_id('A.dra') FROM unnest(ARRAY[2, 3]) AS d;
INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id, vessel_id)
SELECT tests.user_id('A.x18_leave'), g.d::date, 'L', tests.company_id('A'), tests.vessel_id('A.dra')
FROM generate_series(:'pm1'::date, :'pm_last'::date, interval '1 day') AS g(d);
-- A day on board (F) is not leave.
INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id, vessel_id)
VALUES (tests.user_id('A.x18_deck'), :'pm1'::date + 10, 'F', tests.company_id('A'), tests.vessel_id('A.dra'));

CREATE OR REPLACE FUNCTION pg_temp.w(VARIADIC p numeric[]) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('block_type', 'work', 'start_minute', round(p[i] * 60)::integer, 'end_minute', round(p[i + 1] * 60)::integer) ORDER BY i), '[]'::jsonb)
  FROM generate_series(1, coalesce(array_length(p, 1), 0), 2) AS i
$$;
CREATE OR REPLACE FUNCTION pg_temp.save(p_vessel text, p_crew text, p_day date, p_blocks jsonb) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.work_rest_save_day(%L::uuid, %L::uuid, %L::date, %L::jsonb)', tests.vessel_id(p_vessel), tests.user_id(p_crew), p_day, p_blocks)
$$;
CREATE OR REPLACE FUNCTION pg_temp.tr(p_vessel text, p_crew text, p_year integer, p_month integer, p_action text, p_reason text DEFAULT NULL) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.work_rest_month_transition(%L::uuid, %L::uuid, %s, %s, %L, %L)', tests.vessel_id(p_vessel), tests.user_id(p_crew), p_year, p_month, p_action, p_reason)
$$;
CREATE OR REPLACE FUNCTION pg_temp.board(p_vessel text, p_year integer, p_month integer) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.work_rest_vessel_board(%L::uuid, %s, %s)', tests.vessel_id(p_vessel), p_year, p_month)
$$;
CREATE OR REPLACE FUNCTION pg_temp.review(p_nc uuid, p_outcome text, p_note text DEFAULT NULL) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.work_rest_review_breach(%L::uuid, %L, %L)', p_nc, p_outcome, p_note)
$$;
CREATE OR REPLACE FUNCTION pg_temp.remind(p_vessel text, p_keys text[], p_year integer, p_month integer) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.work_rest_remind(%L::uuid, %L::uuid[], %s, %s)', tests.vessel_id(p_vessel),
                (SELECT array_agg(tests.user_id(k)) FROM unnest(p_keys) AS k), p_year, p_month)
$$;
CREATE OR REPLACE FUNCTION pg_temp.month_id(p_vessel text, p_crew text, p_year integer, p_month integer) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT s.id FROM public.work_rest_monthly_submissions AS s
  WHERE s.crew_id = tests.user_id(p_crew) AND s.vessel_id = tests.vessel_id(p_vessel) AND s.period_year = p_year AND s.period_month = p_month
$$;
CREATE OR REPLACE FUNCTION pg_temp.status(p_vessel text, p_crew text, p_year integer, p_month integer) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT s.status FROM public.work_rest_monthly_submissions AS s WHERE s.id = pg_temp.month_id(p_vessel, p_crew, p_year, p_month)
$$;
-- A breach's id, read as the test's owner (the caller's breach policies would hide it).
CREATE OR REPLACE FUNCTION pg_temp.nc(p_crew text, p_day date, p_rule text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT n.id FROM public.work_rest_non_conformities AS n
  WHERE n.crew_id = tests.user_id(p_crew) AND n.breach_day = p_day AND n.rule_code = p_rule AND n.superseded_at IS NULL
  ORDER BY n.created_at, n.id LIMIT 1
$$;
CREATE OR REPLACE FUNCTION pg_temp.nc_any(p_crew text, p_rule text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT n.id FROM public.work_rest_non_conformities AS n
  WHERE n.crew_id = tests.user_id(p_crew) AND n.rule_code = p_rule
  ORDER BY n.created_at, n.id LIMIT 1
$$;
-- The output of an RPC, captured once (results_eq runs its query twice).
CREATE TEMP TABLE rpc_out (k text PRIMARY KEY, r jsonb) ON COMMIT DROP;
GRANT ALL ON rpc_out TO authenticated, service_role;
CREATE OR REPLACE FUNCTION pg_temp.keep(p_key text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO rpc_out VALUES (p_key, v) ON CONFLICT (k) DO UPDATE SET r = excluded.r;
  RETURN v;
END;
$$;
-- One member of a kept board.
CREATE OR REPLACE FUNCTION pg_temp.m(p_board text, p_key text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT x FROM rpc_out AS o, jsonb_array_elements(o.r -> 'members') AS x WHERE o.k = p_board AND x ->> 'user_id' = tests.user_id(p_key)::text
$$;
CREATE OR REPLACE FUNCTION pg_temp.ints(p jsonb) RETURNS integer[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(x::integer ORDER BY x::integer), '{}') FROM jsonb_array_elements_text(p) AS x
$$;

-- Setup checks.
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x18_chief_officer'), 'vessel.crew.hours_of_rest.approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x18_chief_officer'), 'vessel.crew.hours_of_rest.final_approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.master_dra'), 'vessel.crew.hours_of_rest.final_approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x18_deck'), 'vessel.crew.hours_of_rest.approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x18_deck'), 'vessel.crew.hours_of_rest.view', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x18_viewer'), 'vessel.crew.hours_of_rest.view', tests.company_id('A'), tests.vessel_id('A.dra')),
  'setup: heads of department approve, the master final-approves, crew view, the viewer nothing');
SELECT tests.ok(public.work_rest_is_fleet_hr(tests.user_id('A.x18_hr'), tests.company_id('A'))
                AND public.work_rest_is_dpa(tests.user_id('A.fleet_manager'), tests.company_id('A'))
                AND NOT public.work_rest_is_fleet_hr(tests.user_id('A.x18_deck'), tests.company_id('A'))
                AND NOT public.work_rest_is_dpa(tests.user_id('A.x18_hr'), tests.company_id('A'))
                AND NOT public.work_rest_is_fleet_hr(tests.user_id('A.x18_hr'), tests.company_id('B')),
  'setup: the shore HR member is fleet HR of A only, the fleet manager is the DPA');
SELECT tests.results_eq(
  $q$SELECT k, public.work_rest_report_recipient_kind(tests.user_id(k), tests.company_id('A'))
     FROM unnest(ARRAY['A.fleet_manager', 'A.x18_hr', 'A.x18_deck', 'A.disabled', 'A.master_dra']) AS k ORDER BY k$q$,
  $q$VALUES ('A.disabled', NULL::text), ('A.fleet_manager', 'dpa'), ('A.master_dra', NULL), ('A.x18_deck', NULL), ('A.x18_hr', 'fleet_hr')$q$,
  'who may receive a breach report (D-X1-14): the DPA and fleet HR, never crew, the Master or an inactive member');
SELECT tests.is(public.work_rest_role_label(tests.user_id('A.x18_chief_officer'), tests.vessel_id('A.dra')), 'Chief Officer',
  'the role label is the position''s catalogue name');
SELECT tests.is(public.work_rest_role_label(tests.user_id('A.x18_hr'), tests.vessel_id('A.dra')), 'Fleet office',
  '... and Fleet office for someone with fleet reach and no position aboard');

-- ------------------------------------------------------------ 1. schema

SELECT tests.ok((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.work_rest_reminders'::regclass, 'public.work_rest_breach_reports'::regclass)),
  'both tables have row level security');
SELECT tests.ok(obj_description('public.work_rest_reminders'::regclass, 'pg_class') IS NOT NULL
                AND obj_description('public.work_rest_breach_reports'::regclass, 'pg_class') IS NOT NULL
                AND obj_description('public.work_rest_breach_reviews'::regclass, 'pg_class') IS NOT NULL,
  'the tables and the view are commented');
SELECT tests.is_empty(
  $q$SELECT policyname FROM pg_policies WHERE tablename IN ('work_rest_reminders', 'work_rest_breach_reports') AND cmd <> 'SELECT'$q$,
  'no browser write policy: the definers write');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'work_rest_reminders_manual_daily' AND indexdef LIKE '%WHERE (kind = ''manual''::text)%')
                AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'work_rest_reminders_automatic_once' AND indexdef LIKE '%WHERE (kind <> ''manual''::text)%'),
  'one manual reminder a person, vessel and day; each automatic kind once a month');
SELECT tests.ok((SELECT reloptions::text LIKE '%security_invoker=true%' FROM pg_class WHERE oid = 'public.work_rest_breach_reviews'::regclass),
  'work_rest_breach_reviews is a security-invoker view (fleet operations R9)');
SELECT tests.results_eq(
  $q$SELECT column_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'work_rest_breach_reviews' ORDER BY ordinal_position LIMIT 12$q$,
  $q$VALUES ('nc_id'), ('vessel_id'), ('crew_id'), ('window_start'), ('window_end'), ('is_serious'), ('deficit_hours'),
            ('review_outcome'), ('reviewed_by'), ('reviewed_at'), ('breach_report_id'), ('superseded_at')$q$,
  'the view''s columns are the R9 contract, in order');
SELECT tests.throws_like(
  format($q$INSERT INTO public.work_rest_reminders (vessel_id, crew_user_id, period_year, period_month, kind, sent_on) VALUES (%L, %L, 2026, 1, 'manual', current_date)$q$,
         tests.vessel_id('A.dra'), tests.user_id('B.x18_crew')),
  '23514', 'work_rest_reminder_scope_mismatch', 'a reminder never names a crew member of another company');

-- ------------------------------------------------------------ the month's days

SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x18_deck', :'pm1'::date + 1, pg_temp.w(8, 18)), 'the deckhand records a compliant day');
SELECT tests.lives(pg_temp.save('A.dra', 'A.x18_deck', :'pm1'::date + 5, pg_temp.w(6, 22)), 'a 16 h day (24 h and interval breaches)');
SELECT tests.lives(pg_temp.save('A.dra', 'A.x18_deck', :'pm1'::date + 8, pg_temp.w(0, 23)), 'a 23 h day (a serious breach)');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x18_chief_officer', :'pm1'::date + 3, pg_temp.w(6, 22)), 'the chief officer records a long day of their own');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x18_stew', :'pm1'::date + 4, pg_temp.w(6, 22)), 'the master records a long day for the stew');
SELECT tests.reset_role();
SELECT tests.ok(pg_temp.nc('A.x18_deck', :'pm1'::date + 8, 'REST_24H_MIN') IS NOT NULL
                AND (SELECT is_serious FROM public.work_rest_non_conformities WHERE id = pg_temp.nc('A.x18_deck', :'pm1'::date + 8, 'REST_24H_MIN')),
  'setup: the 23 h day is a serious 24 h breach');

-- ------------------------------------------------------------ 8. the serious-breach trigger

SELECT tests.results_eq(
  format($q$SELECT o.severity, o.link_scope, o.link_path LIKE 'crew/hours-of-rest?month=%%&breaches=open',
                   %L = ANY (o.must_act_user_ids), %L = ANY (o.must_act_user_ids), %L = ANY (o.must_act_user_ids), o.payload ? 'nc_id'
            FROM public.notification_outbox AS o
            WHERE o.type_key = 'hor_serious_breach' AND o.dedupe_key = %L$q$,
         tests.user_id('A.master_dra'), tests.user_id('A.x18_hr'), tests.user_id('A.x18_deck'),
         format('hor_serious_breach:%s:REST_24H_MIN:%s', tests.user_id('A.x18_deck'), to_char(:'pm1'::date + 8, 'YYYY-MM-DD'))),
  $q$VALUES ('critical', 'vessel', true, true, true, false, true)$q$,
  'a serious breach tells the Master and fleet HR at once (critical, a link to the board''s breaches), never the crew member');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'hor_serious_breach'
                 AND dedupe_key LIKE format('hor_serious_breach:%s:%%', tests.user_id('A.x18_deck'))),
                (SELECT count(*) FROM public.work_rest_non_conformities WHERE crew_id = tests.user_id('A.x18_deck') AND is_serious AND superseded_at IS NULL),
  'one notice per serious breach (person, rule and day)');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'hor_serious_breach'
                 AND dedupe_key LIKE format('hor_serious_breach:%s:%%', tests.user_id('A.x18_stew'))), 0::bigint,
  'a breach that is not serious sends nothing');
-- Saving the same day again (the engine updates is_serious in place) sends nothing new.
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x18_deck', :'pm1'::date + 8, pg_temp.w(0, 23)), 'the same serious day saved again');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'hor_serious_breach'
                 AND dedupe_key = format('hor_serious_breach:%s:REST_24H_MIN:%s', tests.user_id('A.x18_deck'), to_char(:'pm1'::date + 8, 'YYYY-MM-DD'))), 1::bigint,
  '... still one notice');
-- A breach that becomes serious sends one (the update path).
UPDATE public.work_rest_non_conformities SET is_serious = true WHERE id = pg_temp.nc('A.x18_stew', :'pm1'::date + 4, 'REST_24H_MIN');
SELECT tests.is((SELECT count(*) FROM public.notification_outbox WHERE type_key = 'hor_serious_breach'
                 AND dedupe_key LIKE format('hor_serious_breach:%s:%%', tests.user_id('A.x18_stew'))), 1::bigint,
  'a breach that becomes serious sends its notice');
UPDATE public.work_rest_non_conformities SET is_serious = false WHERE id = pg_temp.nc('A.x18_stew', :'pm1'::date + 4, 'REST_24H_MIN');

-- ------------------------------------------------------------ 2. the board

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT pg_temp.keep('pm', pg_temp.board('A.dra', :pm_y, :pm_m));
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT x ->> 'user_id' FROM rpc_out AS o, jsonb_array_elements(o.r -> 'members') AS x WHERE o.k = 'pm' ORDER BY 1$q$,
  $q$SELECT tests.user_id(k)::text FROM unnest(ARRAY['A.x18_deck', 'A.x18_stew', 'A.x18_chief_officer', 'A.x18_chief_stew', 'A.x18_viewer',
                                                     'A.x18_leave', 'A.x18_gone', 'A.x18_signoff', 'A.x18_transfer', 'A.master_dra', 'A.disabled']) AS k ORDER BY 1$q$,
  'T-144: the board holds everyone assigned to the vessel on any day of the month (ended and transferred-out people included), no other vessel''s or tenant''s crew');
SELECT tests.results_eq(
  $q$SELECT (r ->> 'year')::integer, (r ->> 'month')::integer, r ->> 'hod_step', (r ->> 'can_final_approve')::boolean, r -> 'hor' ->> 'off'
     FROM rpc_out WHERE k = 'pm'$q$,
  format($q$VALUES (%s, %s, 'nudge', true, 'false')$q$, :pm_y, :pm_m),
  'the board says the month, the HoD step, that the master final-approves and that Hours of Rest is on');
SELECT tests.results_eq(
  $q$SELECT pg_temp.ints(pg_temp.m('pm', 'A.x18_deck') #> '{days,records}'),
            ARRAY[6, 9] <@ pg_temp.ints(pg_temp.m('pm', 'A.x18_deck') #> '{days,breach}'),
            NOT (2 = ANY (pg_temp.ints(pg_temp.m('pm', 'A.x18_deck') #> '{days,breach}'))),
            pg_temp.ints(pg_temp.m('pm', 'A.x18_deck') #> '{days,leave}'),
            (pg_temp.m('pm', 'A.x18_deck') #>> '{counts,logged}')::integer,
            (pg_temp.m('pm', 'A.x18_deck') #>> '{counts,serious_open}')::integer >= 1,
            pg_temp.m('pm', 'A.x18_deck') ->> 'department_key',
            pg_temp.m('pm', 'A.x18_deck') ->> 'position_name'$q$,
  $q$VALUES (ARRAY[2, 6, 9], true, true, '{}'::integer[], 3, true, 'deck', 'Deckhand')$q$,
  'a card: recorded days, breach days, no leave (F is on board), the counts, the department and position');
SELECT tests.results_eq(
  $q$SELECT (pg_temp.m('pm', 'A.x18_deck') #>> '{counts,expected}')::integer, (pg_temp.m('pm', 'A.x18_deck') #>> '{counts,missing}')::integer,
            (pg_temp.m('pm', 'A.x18_stew') #>> '{counts,expected}')::integer, pg_temp.ints(pg_temp.m('pm', 'A.x18_stew') #> '{days,leave}')$q$,
  format($q$VALUES (%s, %s, %s, ARRAY[3, 4])$q$, :pm_days, :pm_days - 3, :pm_days - 2),
  'expected days: every assigned day of the month with Hours of Rest on; leave days are not expected');
SELECT tests.results_eq(
  $q$SELECT (pg_temp.m('pm', k) ->> 'former_crew')::boolean, (pg_temp.m('pm', k) ->> 'still_aboard')::boolean,
            (pg_temp.m('pm', k) ->> 'on_leave_all_month')::boolean
     FROM unnest(ARRAY['A.x18_deck', 'A.x18_gone', 'A.x18_transfer', 'A.x18_leave']) WITH ORDINALITY AS t(k, o) ORDER BY o$q$,
  $q$VALUES (false, true, false), (true, false, false), (true, false, false), (false, true, true)$q$,
  'former crew (left, or transferred out) and on leave all month');
SELECT tests.results_eq(
  $q$SELECT (pg_temp.m('pm', 'A.x18_leave') #>> '{counts,expected}')::integer, jsonb_array_length(pg_temp.m('pm', 'A.x18_transfer') -> 'assignments'),
            pg_temp.m('pm', 'A.x18_transfer') #>> '{assignments,0,to}'$q$,
  format($q$VALUES (0, 1, %L)$q$, to_char(:'pm1'::date + 14, 'YYYY-MM-DD')),
  'the leave card expects nothing; the transferred-out card carries its assignment on this vessel');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT pg_temp.keep('hyd', pg_temp.board('A.hyd', :pm_y, :pm_m));
SELECT pg_temp.keep('cm', pg_temp.board('A.dra', :cm_y, :cm_m));
SELECT tests.reset_role();
SELECT tests.ok(pg_temp.m('hyd', 'A.x18_transfer') IS NOT NULL AND (pg_temp.m('hyd', 'A.x18_transfer') ->> 'former_crew')::boolean IS FALSE
                AND pg_temp.m('hyd', 'A.crew_hyd') IS NOT NULL AND pg_temp.m('hyd', 'A.x18_deck') IS NULL,
  'D-X1-20: the transferred person is on the new vessel''s board for the same month too, as current crew');
SELECT tests.ok(pg_temp.m('cm', 'A.x18_transfer') IS NULL AND pg_temp.m('cm', 'A.x18_deck') IS NOT NULL,
  '... and leaves the origin board once the month no longer overlaps their assignment');

-- The caller facts of a head of department.
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT pg_temp.keep('pm_hod', pg_temp.board('A.dra', :pm_y, :pm_m));
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT r ->> 'my_department_key', (r ->> 'can_final_approve')::boolean, jsonb_array_length(r -> 'members') FROM rpc_out WHERE k = 'pm_hod'$q$,
  $q$VALUES ('deck', false, 11)$q$,
  'a head of department sees the whole board, with their department and no final approval');

-- C45: before the vessel's Hours of Rest start date nothing is expected.
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled, enabled_from)
VALUES (tests.vessel_id('A.dra'), tests.company_id('A'), 'crew_hor', true, :'pm1'::date + 10);
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT pg_temp.keep('pm_start', pg_temp.board('A.dra', :pm_y, :pm_m));
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT r #>> '{hor,from}', (pg_temp.m('pm_start', 'A.x18_deck') #>> '{counts,expected}')::integer FROM rpc_out WHERE k = 'pm_start'$q$,
  format($q$VALUES (%L, %s)$q$, to_char(:'pm1'::date + 10, 'YYYY-MM-DD'), :pm_days - 10),
  'C45: the board says when Hours of Rest starts, and days before it are not expected');
DELETE FROM public.vessel_module_settings WHERE vessel_id = tests.vessel_id('A.dra');

-- Gates.
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.throws_like(pg_temp.board('A.dra', :pm_y, :pm_m), '42501', 'crew_not_permitted', 'a crew member does not see the board');
SELECT tests.as_user(tests.user_id('A.x18_viewer'));
SELECT tests.throws_like(pg_temp.board('A.dra', :pm_y, :pm_m), '42501', 'crew_not_permitted', 'nor does someone without hours of rest rights');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(pg_temp.board('A.dra', :pm_y, :pm_m), '42501', 'crew_not_permitted', 'an inactive user is refused');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(pg_temp.board('A.dra', :pm_y, :pm_m), '42501', 'crew_not_permitted', 'another tenant is refused');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(pg_temp.board('A.hyd', :pm_y, :pm_m), '42501', 'crew_not_permitted', 'a vessel the master does not reach is refused');
SELECT tests.throws_like(format('SELECT public.work_rest_vessel_board(%L::uuid, %s, %s)', tests.id('no vessel'), :pm_y, :pm_m), 'P0002', 'vessel_not_found',
  'an unknown vessel is P0002');
SELECT tests.throws_like(pg_temp.board('A.dra', :nm_y, :nm_m), '22023', 'month_in_future', 'a month still to come is refused');
SELECT tests.throws_like(pg_temp.board('A.dra', :pm_y, 13), '22023', 'month_required', 'a month must be 1 to 12');
SELECT tests.as_anon();
SELECT tests.throws(pg_temp.board('A.dra', :pm_y, :pm_m), '42501', 'anon cannot call the board');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 3. the breach list

CREATE OR REPLACE FUNCTION pg_temp.breaches(p_only_open boolean DEFAULT false) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT * FROM public.work_rest_vessel_breaches(%L::uuid, %L::date, %L::date, %L)', tests.vessel_id('A.dra'),
                (date_trunc('month', current_date) - interval '1 month')::date, (date_trunc('month', current_date) - interval '1 day')::date, p_only_open)
$$;
CREATE TEMP TABLE br_out (who text, nc_id uuid, crew_user_id uuid, is_serious boolean, deficit_hours numeric, rule_code text, can_review boolean, n integer) ON COMMIT DROP;
GRANT ALL ON br_out TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.keep_breaches(p_who text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('INSERT INTO br_out SELECT %L, b.nc_id, b.crew_user_id, b.is_serious, b.deficit_hours, b.rule_code, b.can_review, row_number() OVER () FROM (%s) AS b',
                 p_who, pg_temp.breaches());
END;
$$;
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT pg_temp.keep_breaches('hod');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT pg_temp.keep_breaches('master');
SELECT tests.reset_role();
SELECT tests.ok((SELECT is_serious FROM br_out WHERE who = 'hod' AND n = 1), 'serious breaches come first');
SELECT tests.results_eq(
  format($q$SELECT bool_and(can_review) FILTER (WHERE crew_user_id = %L), bool_or(can_review) FILTER (WHERE crew_user_id = %L),
                   bool_or(can_review) FILTER (WHERE crew_user_id = %L)
            FROM br_out WHERE who = 'hod'$q$, tests.user_id('A.x18_deck'), tests.user_id('A.x18_stew'), tests.user_id('A.x18_chief_officer')),
  $q$VALUES (true, false, false)$q$,
  'a head of department may review their own department''s breaches, not another''s, nor their own');
SELECT tests.results_eq(
  format($q$SELECT bool_and(can_review) FILTER (WHERE crew_user_id IN (%L, %L)) FROM br_out WHERE who = 'master'$q$,
         tests.user_id('A.x18_stew'), tests.user_id('A.x18_chief_officer')),
  $q$VALUES (true)$q$,
  'the final approver may review every department''s breaches');
SELECT tests.ok((SELECT deficit_hours = 9 FROM br_out WHERE who = 'hod' AND nc_id = pg_temp.nc('A.x18_deck', :'pm1'::date + 8, 'REST_24H_MIN')),
  'the deficit column: hours short of the threshold (10 h - 1 h)');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_vessel_breaches(tests.vessel_id('A.dra'), :'pm1'::date, :'pm_last'::date, true)),
                (SELECT count(*) FROM br_out WHERE who = 'hod'), 'open only: every breach is open before the review');
SELECT tests.throws_like(format('SELECT * FROM public.work_rest_vessel_breaches(%L::uuid, %L::date, %L::date)', tests.vessel_id('A.dra'), current_date - 400, current_date),
  '22023', 'range_too_long', 'the range is at most a year');
SELECT tests.throws_like(format('SELECT * FROM public.work_rest_vessel_breaches(%L::uuid, %L::date, %L::date)', tests.vessel_id('A.dra'), current_date, current_date - 1),
  '22023', 'range_invalid', 'the end is not before the start');
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.throws_like(pg_temp.breaches(), '42501', 'crew_not_permitted', 'a crew member does not list the vessel''s breaches');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 4. the review

SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x18_deck', :pm_y, :pm_m, 'submit'), 'the deckhand submits the month');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_24H_MIN'), 'accepted'), '22023', 'note_required',
  'accepting a breach needs a justification');
SELECT pg_temp.keep('accept', pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_24H_MIN'), 'accepted', 'Emergency: engine room fire drill'));
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT review_outcome, status, justification, review_note, reviewed_by = %L, reviewer_id = %L, reviewed_at IS NOT NULL
            FROM public.work_rest_non_conformities WHERE id = %L$q$,
         tests.user_id('A.x18_chief_officer'), tests.user_id('A.x18_chief_officer'), pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_24H_MIN')),
  $q$VALUES ('accepted', 'justified', 'Emergency: engine room fire drill', 'Emergency: engine room fire drill', true, true, true)$q$,
  'accepted: the outcome, the justification and who reviewed it');
SELECT tests.ok((SELECT r ->> 'review_outcome' = 'accepted' AND NOT (r ->> 'reopened')::boolean AND r ->> 'month_status' = 'submitted' FROM rpc_out WHERE k = 'accept'),
  '... the month stays as it was');
SELECT tests.is((SELECT count(*) FROM public.work_rest_audit_log WHERE action = 'breach_reviewed' AND entity_id = pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_24H_MIN')), 1::bigint,
  'the review writes an audit row');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_24H_MIN'), 'accepted', 'Again'), '22023', 'already_reviewed',
  'a reviewed breach is not reviewed again');
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_stew', :'pm1'::date + 4, 'REST_24H_MIN'), 'accepted', 'Fine'), '42501', 'out_of_department',
  'a head of department does not review another department''s breach');
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_chief_officer', :'pm1'::date + 3, 'REST_24H_MIN'), 'accepted', 'Fine'), '42501', 'own_breach',
  'nobody reviews their own breach');
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_INTERVAL_MAX'), 'dismissed', 'Data error'), '22023', 'dismiss_needs_correction',
  'a breach is dismissed only after a correction was requested');
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_INTERVAL_MAX'), 'ignored'), '22023', 'outcome_invalid',
  'an unknown outcome is refused');
SELECT tests.throws_like(pg_temp.review(tests.id('no breach'), 'accepted', 'x'), 'P0002', 'breach_not_found', 'an unknown breach is P0002');
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.throws_like(format($q$UPDATE public.work_rest_non_conformities SET review_outcome = 'accepted', review_note = 'Mine' WHERE id = %L$q$,
                                pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_INTERVAL_MAX')),
  '42501', 'work_rest_engine_only', 'a crew member never reviews their own breach by writing the row (the 060700 guard)');
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_stew', :'pm1'::date + 4, 'REST_24H_MIN'), 'accepted', 'Fine'), '42501', 'not_permitted',
  'a crew member does not review breaches');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_INTERVAL_MAX'), 'accepted', 'x'), 'P0002', 'breach_not_found',
  'another tenant''s breach reads as not found');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 5, 'REST_INTERVAL_MAX'), 'accepted', 'x'), NULL, 'an inactive user is refused');
SELECT tests.reset_role();

-- correction_requested reopens the submitted month through the engine.
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT pg_temp.keep('correct', pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 8, 'REST_24H_MIN'), 'correction_requested', 'Check the start of your day'));
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'reopened')::boolean AND r ->> 'month_status' = 'reopened' AND r ->> 'status' = 'reviewed' FROM rpc_out WHERE k = 'correct'),
  'correction_requested: the month is reopened for the crew member');
SELECT tests.results_eq(
  format($q$SELECT s.status, s.submitted_at IS NULL, s.reopened_by = %L, s.reopen_reason LIKE 'Correction requested for%%'
            FROM public.work_rest_monthly_submissions AS s WHERE s.id = %L$q$,
         tests.user_id('A.x18_chief_officer'), pg_temp.month_id('A.dra', 'A.x18_deck', :pm_y, :pm_m)),
  $q$VALUES ('reopened', true, true, true)$q$,
  '... the stamps cleared, who reopened it and why');
SELECT tests.is((SELECT count(*) FROM public.work_rest_signatures
                 WHERE submission_id = pg_temp.month_id('A.dra', 'A.x18_deck', :pm_y, :pm_m) AND stale_at IS NULL), 0::bigint,
  '... the earlier signatures are kept as stale');
SELECT tests.is((SELECT count(*) FROM public.work_rest_audit_log
                 WHERE action = 'month_reopen' AND submission_id = pg_temp.month_id('A.dra', 'A.x18_deck', :pm_y, :pm_m)
                   AND metadata ->> 'by' = 'breach_review'), 1::bigint,
  '... and the reopen is in the audit log');
SELECT tests.results_eq(
  format($q$SELECT o.link_scope, o.link_path LIKE %L, o.must_act_user_ids = ARRAY[%L]::uuid[], o.severity
            FROM public.notification_outbox AS o WHERE o.type_key = 'hor_correction_requested' AND o.dedupe_key = %L$q$,
         'hours-of-rest?month=' || to_char(:'pm1'::date, 'YYYY-MM') || '%', tests.user_id('A.x18_deck'),
         'hor_correction_requested:' || pg_temp.nc('A.x18_deck', :'pm1'::date + 8, 'REST_24H_MIN')),
  $q$VALUES ('personal', true, true, 'warning')$q$,
  'the crew member hears of the correction (personal link to their month)');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 8, 'REST_24H_MIN'), 'correction_requested'), '22023', 'correction_already_requested',
  'a correction is requested once');
SELECT tests.reset_role();

-- A pending correction blocks approval; dismissing it (after the correction) clears the way.
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x18_deck', :pm_y, :pm_m, 'submit'), 'the deckhand submits the month again');
SELECT tests.reset_role();
CREATE TEMP TABLE to_accept ON COMMIT DROP AS
SELECT n.id FROM public.work_rest_non_conformities AS n
WHERE n.crew_id = tests.user_id('A.x18_deck') AND n.superseded_at IS NULL AND n.review_outcome IS NULL AND n.status = 'open';
GRANT SELECT ON to_accept TO authenticated;
SELECT tests.ok((SELECT count(*) FROM to_accept) >= 2, 'setup: the deckhand''s month has more breaches to review');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.lives(format('SELECT public.work_rest_review_breach(%L::uuid, ''accepted'', ''Reviewed with the crew member'')', id),
  'the final approver accepts an open breach') FROM to_accept;
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x18_deck', :pm_y, :pm_m, 'approve'), '22023', 'correction_pending',
  'a month with a correction still requested is not approved');
SELECT tests.lives(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 8, 'REST_24H_MIN'), 'dismissed', 'Recorded wrongly; checked with the crew member'),
  'the final approver dismisses the corrected breach');
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x18_deck', :pm_y, :pm_m, 'approve'), '... and approves the month');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.status('A.dra', 'A.x18_deck', :pm_y, :pm_m), 'approved', 'the month is approved');

-- Reopening an approved month for a correction needs the final approver.
INSERT INTO public.work_rest_non_conformities (crew_id, submission_id, vessel_id, breach_day, rule_code, rule_description, severity, window_start, window_end, measured_value, threshold_value, status)
VALUES (tests.user_id('A.x18_deck'), pg_temp.month_id('A.dra', 'A.x18_deck', :pm_y, :pm_m), tests.vessel_id('A.dra'), :'pm1'::date + 20, 'REST_PERIODS_MAX', 'Minor', 'low',
        (:'pm1'::date + 20)::timestamptz, (:'pm1'::date + 21)::timestamptz, 3, 2, 'open');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 20, 'REST_PERIODS_MAX'), 'correction_requested'), '42501', 'reopen_not_permitted',
  'a head of department does not send an approved month back');
SELECT tests.lives(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 20, 'REST_PERIODS_MAX'), 'accepted', 'Short break counted'),
  '... but may accept the low breach');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.status('A.dra', 'A.x18_deck', :pm_y, :pm_m), 'approved', 'accepting leaves the approved month as it is');

-- A superseded breach is not reviewed.
UPDATE public.work_rest_non_conformities SET superseded_at = now() WHERE id = pg_temp.nc('A.x18_stew', :'pm1'::date + 4, 'REST_INTERVAL_MAX');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(pg_temp.review(pg_temp.nc_any('A.x18_stew', 'REST_INTERVAL_MAX'), 'accepted', 'x'),
  '22023', 'breach_superseded', 'a superseded breach is not reviewed');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 5. reminders

SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT pg_temp.keep('remind', pg_temp.remind('A.dra', ARRAY['A.x18_deck', 'A.x18_stew'], :cm_y, :cm_m));
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'sent')::integer = 2 AND r ->> 'by_label' = 'Chief Officer' AND jsonb_array_length(r -> 'skipped') = 0 FROM rpc_out WHERE k = 'remind'),
  'the head of department reminds two crew members');
SELECT tests.results_eq(
  format($q$SELECT kind, sent_by = %L, sent_by_role_label, sent_on = current_date, channel, profile_id = %L, company_id = %L
            FROM public.work_rest_reminders WHERE crew_user_id = %L AND vessel_id = %L$q$,
         tests.user_id('A.x18_chief_officer'), tests.profile_id('A.x18_deck'), tests.company_id('A'), tests.user_id('A.x18_deck'), tests.vessel_id('A.dra')),
  $q$VALUES ('manual', true, 'Chief Officer', true, 'in_app', true, true)$q$,
  'the log: "Reminded <date> by Chief Officer", in-app only (D-249), on the person''s profile');
SELECT tests.results_eq(
  format($q$SELECT count(*), bool_and(o.link_scope = 'personal'), bool_and(o.link_path LIKE 'hours-of-rest?month=%%'), bool_and(cardinality(o.must_act_user_ids) = 1)
            FROM public.notification_outbox AS o WHERE o.type_key = 'hor_reminder'
              AND o.dedupe_key IN (SELECT 'hor_reminder:' || w.id FROM public.work_rest_reminders AS w WHERE w.sent_by = %L)$q$,
         tests.user_id('A.x18_chief_officer')),
  $q$VALUES (2::bigint, true, true, true)$q$,
  'each reminder tells its crew member in STORM (hor_reminder)');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.throws_like(pg_temp.remind('A.dra', ARRAY['A.x18_deck'], :cm_y, :cm_m), '22023', 'reminder_rate_limited', 'one manual reminder a person and day');
SELECT tests.throws_like(pg_temp.remind('A.dra', ARRAY['A.crew_hyd'], :cm_y, :cm_m), '42501', 'not_on_board', 'someone of another vessel is refused');
SELECT tests.throws_like(pg_temp.remind('A.dra', ARRAY['A.x18_viewer', 'B.x18_crew'], :cm_y, :cm_m), '42501', 'not_on_board',
  'an id outside the board refuses the whole call');
SELECT tests.throws_like(format('SELECT public.work_rest_remind(%L::uuid, %L::uuid[], %s, %s)', tests.vessel_id('A.dra'), '{}', :cm_y, :cm_m), '22023', 'crew_required',
  'someone must be chosen');
SELECT tests.throws_like(pg_temp.remind('A.dra', ARRAY['A.x18_viewer'], :nm_y, :nm_m), '22023', 'month_in_future', 'a month still to come is refused');
SELECT tests.as_user(tests.user_id('A.x18_chief_stew'));
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x18_chief_stew', :pm_y, :pm_m, 'submit'), 'the chief stew submits their month');
SELECT pg_temp.keep('remind_pm', pg_temp.remind('A.dra', ARRAY['A.x18_chief_stew', 'A.x18_viewer'], :pm_y, :pm_m));
SELECT tests.throws_like(pg_temp.remind('A.dra', ARRAY['A.x18_chief_stew'], :pm_y, :pm_m), '22023', 'month_closed', 'a submitted month is not reminded');
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'sent')::integer = 1 AND r #>> '{skipped,0,reason}' = 'month_closed' AND r #>> '{skipped,0,user_id}' = tests.user_id('A.x18_chief_stew')::text
                 FROM rpc_out WHERE k = 'remind_pm'),
  '... it is skipped, the others are reminded');
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.throws_like(pg_temp.remind('A.dra', ARRAY['A.x18_stew'], :cm_y, :cm_m), '42501', 'crew_not_permitted', 'a crew member does not remind');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT pg_temp.keep('cm_hod', pg_temp.board('A.dra', :cm_y, :cm_m));
SELECT tests.reset_role();
SELECT tests.results_eq(
  $q$SELECT pg_temp.m('cm_hod', 'A.x18_deck') #>> '{last_reminder,kind}', pg_temp.m('cm_hod', 'A.x18_deck') #>> '{last_reminder,by_label}',
            (pg_temp.m('cm_hod', 'A.x18_deck') ->> 'reminded_today')::boolean, (pg_temp.m('cm_hod', 'A.x18_chief_stew') ->> 'reminded_today')::boolean$q$,
  $q$VALUES ('manual', 'Chief Officer', true, false)$q$,
  'the board shows the last reminder and whether the person was reminded today');
-- The reminder log's RLS.
INSERT INTO public.work_rest_reminders (vessel_id, crew_user_id, period_year, period_month, kind, sent_on)
VALUES (tests.vessel_id('A.dra'), tests.user_id('A.disabled'), :pm_y, :pm_m, 'auto_month_start', current_date - 3);
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_reminders), 1::bigint, 'a crew member reads only the reminders sent to them');
SELECT tests.as_user(tests.user_id('A.x18_viewer'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_reminders), 1::bigint, '... so does someone without hours of rest rights');
SELECT tests.as_user(tests.user_id('A.x18_chief_stew'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_reminders), 4::bigint, 'an approver of the vessel reads its reminder log');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_reminders), 0::bigint, 'an inactive user reads nothing, not even their own');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_reminders), 0::bigint, 'another tenant reads nothing');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.throws(format($q$DELETE FROM public.work_rest_reminders WHERE crew_user_id = %L$q$, tests.user_id('A.x18_deck')), '42501',
  'the browser never writes the log');
SELECT tests.reset_role();
DELETE FROM public.work_rest_reminders WHERE crew_user_id = tests.user_id('A.disabled');

-- ------------------------------------------------------------ 6. the daily sweep

INSERT INTO public.vessel_work_rest_settings (vessel_id, auto_reminders) VALUES (tests.vessel_id('A.hyd'), false);
SELECT tests.as_service();
SELECT pg_temp.keep('sweep1', format('SELECT public.work_rest_send_due_reminders(%L::date)', :'cm1'));
SELECT pg_temp.keep('sweep1b', format('SELECT public.work_rest_send_due_reminders(%L::date)', :'cm1'));
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'auto_month_start')::integer > 0 FROM rpc_out WHERE k = 'sweep1')
                AND (SELECT (r ->> 'auto_month_start')::integer = 0 FROM rpc_out WHERE k = 'sweep1b'),
  'the 1st: last month''s reminders, once (a second run sends none)');
SELECT tests.results_eq(
  format($q$SELECT k, EXISTS (SELECT 1 FROM public.work_rest_reminders AS w WHERE w.crew_user_id = tests.user_id(k) AND w.kind = 'auto_month_start'
                                AND w.period_year = %s AND w.period_month = %s AND w.sent_on = %L)
            FROM unnest(ARRAY['A.x18_viewer', 'A.x18_stew', 'A.x18_gone', 'A.x18_transfer', 'A.x18_chief_stew', 'A.x18_leave', 'A.disabled', 'A.crew_hyd', 'B.x18_crew']) AS k
            ORDER BY k$q$, :pm_y, :pm_m, :'cm1'),
  $q$VALUES ('A.crew_hyd', false), ('A.disabled', false), ('A.x18_chief_stew', false), ('A.x18_gone', true), ('A.x18_leave', false),
            ('A.x18_stew', true), ('A.x18_transfer', true), ('A.x18_viewer', true), ('B.x18_crew', true)$q$,
  'reminded: open months with expected days (former crew too, any company); not a submitted month, a month all on leave, an inactive person, a vessel with automatic reminders off');
SELECT tests.ok((SELECT count(*) = (SELECT count(*) FROM public.work_rest_reminders WHERE kind = 'auto_month_start')
                 FROM public.notification_outbox AS o WHERE o.type_key = 'hor_reminder'
                   AND o.dedupe_key IN (SELECT 'hor_reminder:' || w.id FROM public.work_rest_reminders AS w WHERE w.kind = 'auto_month_start')),
  'every automatic reminder is sent in STORM');
-- The sign-off day and before the cut-off (the 5th, 3 days before: the 2nd).
INSERT INTO public.vessel_work_rest_settings (vessel_id, cutoff_day_of_month, reminder_days_before_lock) VALUES (tests.vessel_id('A.dra'), 5, 3);
SELECT tests.as_service();
SELECT pg_temp.keep('sweep2', format('SELECT public.work_rest_send_due_reminders(%L::date)', (:'cm1'::date + 1)));
SELECT tests.reset_role();
SELECT tests.ok((SELECT (r ->> 'sign_off')::integer >= 1 AND (r ->> 'pre_cutoff')::integer >= 1 AND (r ->> 'auto_month_start')::integer = 0 FROM rpc_out WHERE k = 'sweep2'),
  'the 2nd: sign-off and pre-cut-off reminders, no month-start ones');
SELECT tests.results_eq(
  format($q$SELECT kind, period_month FROM public.work_rest_reminders
            WHERE crew_user_id = %L AND kind IN ('sign_off', 'pre_cutoff') ORDER BY kind$q$, tests.user_id('A.x18_signoff')),
  format($q$VALUES ('pre_cutoff', %s), ('sign_off', %s)$q$, :pm_m, :cm_m),
  'the person signing off hears on their last day (this month), and before last month''s cut-off');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.work_rest_reminders WHERE crew_user_id = tests.user_id('A.x18_stew') AND kind = 'pre_cutoff' AND period_month = :pm_m),
  'before the cut-off: last month''s open months on the vessel');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.work_rest_reminders WHERE crew_user_id = tests.user_id('A.x18_chief_stew') AND kind = 'pre_cutoff'),
  '... not a submitted month');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws(format('SELECT public.work_rest_send_due_reminders(%L::date)', :'cm1'), '42501', 'the sweep is the service role''s');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 7. the breach report

SELECT tests.as_user(tests.user_id('A.master_dra'));
CREATE TEMP TABLE rcpt ON COMMIT DROP AS SELECT * FROM public.work_rest_breach_report_recipients(tests.vessel_id('A.dra'));
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT user_id = %L, kind FROM rcpt WHERE user_id IN (%L, %L) ORDER BY kind$q$,
         tests.user_id('A.fleet_manager'), tests.user_id('A.fleet_manager'), tests.user_id('A.x18_hr')),
  $q$VALUES (true, 'dpa'), (false, 'fleet_hr')$q$,
  'the recipients: the DPA and fleet HR of the company');
SELECT tests.is((SELECT count(*) FROM rcpt WHERE user_id IN (tests.user_id('A.x18_deck'), tests.user_id('A.master_dra'), tests.user_id('B.admin'))), 0::bigint,
  '... never crew, the Master or another company');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.throws_like(format('SELECT * FROM public.work_rest_breach_report_recipients(%L::uuid)', tests.vessel_id('A.dra')), '42501', 'crew_not_permitted',
  'only the final approver sees the recipients');
SELECT tests.reset_role();

CREATE TEMP TABLE rep_ids ON COMMIT DROP AS
SELECT array_agg(n.id ORDER BY n.id) AS ids FROM public.work_rest_non_conformities AS n
WHERE n.crew_id = tests.user_id('A.x18_deck') AND n.superseded_at IS NULL AND n.review_outcome IN ('accepted', 'dismissed');
GRANT SELECT ON rep_ids TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.report(p_ids uuid[], p_recipients text[], p_from date DEFAULT NULL) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.work_rest_breach_report_create(%L::uuid, %L::date, %L::date, %L::uuid[], %L::uuid[], %L)', tests.vessel_id('A.dra'),
                coalesce(p_from, (date_trunc('month', current_date) - interval '1 month')::date), (date_trunc('month', current_date) - interval '1 day')::date,
                p_ids, (SELECT array_agg(tests.user_id(k)) FROM unnest(p_recipients) AS k), 'Month review')
$$;
SELECT tests.ok((SELECT cardinality(ids) >= 3 FROM rep_ids), 'setup: the deckhand has reviewed breaches');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(pg_temp.report((SELECT ids FROM rep_ids) || pg_temp.nc('A.x18_stew', :'pm1'::date + 4, 'REST_24H_MIN'), ARRAY['A.x18_hr']),
  '22023', 'breach_not_reviewed', 'a report refuses an unreviewed breach');
SELECT tests.throws_like(pg_temp.report((SELECT ids FROM rep_ids), ARRAY['A.x18_hr', 'A.x18_deck']), '22023', 'recipient_not_allowed',
  'a report goes to fleet HR or the DPA only');
SELECT tests.throws_like(pg_temp.report((SELECT ids FROM rep_ids) || tests.id('no breach'), ARRAY['A.x18_hr']), '22023', 'breach_not_on_vessel',
  'an unknown or foreign breach is refused');
SELECT tests.throws_like(pg_temp.report((SELECT ids FROM rep_ids), ARRAY['A.x18_hr'], :'pm1'::date + 7), '22023', 'breach_out_of_range',
  'every breach lies in the period');
SELECT tests.throws_like(pg_temp.report('{}'::uuid[], ARRAY['A.x18_hr']), '22023', 'breaches_required', 'a report has breaches');
SELECT pg_temp.keep('report', pg_temp.report((SELECT ids FROM rep_ids), ARRAY['A.x18_hr', 'A.fleet_manager']));
SELECT tests.throws_like(pg_temp.report((SELECT ids FROM rep_ids), ARRAY['A.x18_hr']), '22023', 'breach_already_reported', 'a breach is reported once');
SELECT tests.throws_like(pg_temp.review(pg_temp.nc('A.x18_deck', :'pm1'::date + 20, 'REST_PERIODS_MAX'), 'correction_requested'), '22023', 'breach_reported',
  'a reported breach no longer changes');
SELECT tests.reset_role();
SELECT tests.ok((SELECT r ->> 'reference' LIKE 'HORBR-%-%' AND (r ->> 'nc_count')::integer = (SELECT cardinality(ids) FROM rep_ids)
                 AND (r ->> 'recipient_count')::integer = 2 FROM rpc_out WHERE k = 'report'),
  'the report is numbered (format_reference) and counts its breaches and recipients');
SELECT tests.is((SELECT count(*) FROM public.work_rest_non_conformities
                 WHERE breach_report_id = (SELECT (r ->> 'report_id')::uuid FROM rpc_out WHERE k = 'report')),
                (SELECT cardinality(ids)::bigint FROM rep_ids),
  'the breaches are flagged with the report');
SELECT tests.results_eq(
  format($q$SELECT o.link_scope, o.link_path LIKE 'crew/hours-of-rest/report?year=%%', %L = ANY (o.must_act_user_ids), %L = ANY (o.must_act_user_ids),
                   cardinality(o.must_act_user_ids)
            FROM public.notification_outbox AS o WHERE o.type_key = 'hor_breach_report' AND o.dedupe_key = %L$q$,
         tests.user_id('A.x18_hr'), tests.user_id('A.fleet_manager'), 'hor_breach_report:' || (SELECT r ->> 'report_id' FROM rpc_out WHERE k = 'report')),
  $q$VALUES ('vessel', true, true, true, 2)$q$,
  'the recipients hear in STORM, with a link to the report page (never automatic, T-142)');
SELECT tests.is((SELECT file_path FROM public.work_rest_breach_reports WHERE id = (SELECT (r ->> 'report_id')::uuid FROM rpc_out WHERE k = 'report')), NULL::text,
  'D-X1-23: no PDF is stored in wave 1');
SELECT tests.is((SELECT count(*) FROM public.work_rest_audit_log WHERE action = 'breach_report_created'), 1::bigint, 'the report is in the audit log');
SELECT tests.as_user(tests.user_id('A.x18_hr'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_breach_reports), 1::bigint, 'a recipient reads the report');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_breach_reports), 1::bigint, 'the vessel''s final approver reads it');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_breach_reports), 0::bigint, 'a head of department does not');
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_breach_reports), 0::bigint, 'nor does the crew member');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_breach_reports), 0::bigint, 'nor another tenant');
SELECT tests.as_user(tests.user_id('A.x18_chief_officer'));
SELECT tests.throws_like(pg_temp.report((SELECT ids FROM rep_ids), ARRAY['A.x18_hr']), '42501', 'crew_not_permitted', 'only the final approver creates a report');
SELECT tests.reset_role();

-- ------------------------------------------------------------ the review view (fleet operations R9)

SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.ok((SELECT count(*) FILTER (WHERE review_outcome IS NOT NULL) > 0 AND count(*) FILTER (WHERE breach_report_id IS NOT NULL) > 0
                 FROM public.work_rest_breach_reviews WHERE crew_id = tests.user_id('A.x18_deck')),
  'the view shows the review state and the report of the breaches the reader may see (the crew member''s own, under the breach policies)');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.is((SELECT count(*) FROM public.work_rest_breach_reviews WHERE vessel_id = tests.vessel_id('A.dra')), 0::bigint,
  'security invoker: another tenant sees none of A''s breaches');
SELECT tests.as_anon();
SELECT tests.throws('SELECT count(*) FROM public.work_rest_breach_reviews', '42501', 'anon cannot read the view');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 9. month statistics

SELECT tests.as_user(tests.user_id('A.x18_deck'));
CREATE TEMP TABLE stats ON COMMIT DROP AS SELECT * FROM public.work_rest_month_stats(tests.vessel_id('A.dra'), :pm_y);
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT crew, days_logged = 5, breach_days >= 3, approved >= 1, awaiting_approval >= 1
            FROM stats WHERE period_month = %s$q$, :pm_m),
  $q$VALUES (11, true, true, true, true)$q$,
  'the month: the board''s crew, days logged, breach days and the months by state');
SELECT tests.ok((SELECT count(*) FROM stats) = CASE WHEN :pm_y < :cm_y THEN 12 ELSE :cm_m END,
  'one row per month of the year up to the current month');
SELECT tests.as_user(tests.user_id('A.x18_viewer'));
SELECT tests.throws_like(format('SELECT * FROM public.work_rest_month_stats(%L::uuid, %s)', tests.vessel_id('A.dra'), :pm_y), '42501', 'crew_not_permitted',
  'statistics need hours of rest view');
SELECT tests.as_user(tests.user_id('A.x18_deck'));
SELECT tests.throws_like(format('SELECT * FROM public.work_rest_month_stats(%L::uuid, 1999)', tests.vessel_id('A.dra')), '22023', 'year_required', 'a year from 2000');
SELECT tests.is((SELECT count(*) FROM public.work_rest_month_stats(tests.vessel_id('A.dra'), :cm_y + 1)), 0::bigint, 'a year still to come has no rows');
SELECT tests.reset_role();

-- ------------------------------------------------------------ 10. a 60-crew board

SELECT tests.seed_user('A', 'A.p' || i, 'crew') FROM generate_series(1, 60) AS i;
SELECT tests.seed_assignment('A.p' || i, 'A.gam', true, CASE WHEN i % 3 = 0 THEN 'Stewardess' ELSE 'Deckhand' END,
                             jsonb_build_object('join_date', current_date - 150)) FROM generate_series(1, 60) AS i;
INSERT INTO public.work_rest_records (crew_id, vessel_id, record_date, total_work_minutes, total_rest_minutes, is_compliant)
SELECT tests.user_id('A.p' || i), tests.vessel_id('A.gam'), :'pm1'::date + d, 600, 840, true
FROM generate_series(1, 60) AS i, generate_series(0, 24) AS d;
INSERT INTO public.work_rest_non_conformities (crew_id, vessel_id, breach_day, rule_code, rule_description, severity, window_start, window_end, measured_value, threshold_value, status)
SELECT tests.user_id('A.p' || i), tests.vessel_id('A.gam'), :'pm1'::date + 3, 'REST_24H_MIN', 'Rest below 10 hours', 'medium',
       (:'pm1'::date + 3)::timestamptz, (:'pm1'::date + 4)::timestamptz, 8, 10, 'open'
FROM generate_series(1, 60) AS i;
INSERT INTO public.crew_leave_entries (crew_id, date, status_code, company_id, vessel_id)
SELECT tests.user_id('A.p' || i), :'pm1'::date + 26, 'L', tests.company_id('A'), tests.vessel_id('A.gam') FROM generate_series(1, 60) AS i;
CREATE TEMP TABLE perf (ms numeric, members integer) ON COMMIT DROP;
GRANT ALL ON perf TO authenticated;
DO $$
DECLARE
  t0 timestamptz;
  v jsonb;
  v_y integer := extract(year FROM date_trunc('month', current_date) - interval '1 month')::integer;
  v_m integer := extract(month FROM date_trunc('month', current_date) - interval '1 month')::integer;
BEGIN
  PERFORM tests.as_user(tests.user_id('A.fleet_manager'));
  v := public.work_rest_vessel_board(tests.vessel_id('A.gam'), v_y, v_m);
  t0 := clock_timestamp();
  v := public.work_rest_vessel_board(tests.vessel_id('A.gam'), v_y, v_m);
  INSERT INTO perf VALUES (extract(epoch FROM clock_timestamp() - t0) * 1000, jsonb_array_length(v -> 'members'));
  PERFORM tests.reset_role();
END
$$;
SELECT tests.is((SELECT members FROM perf), 60, 'the 60-crew board lists every crew member');
SELECT tests.ok((SELECT ms < 500 FROM perf), 'a 60-crew board month answers in under 500 ms (' || (SELECT round(ms) FROM perf) || ' ms)');

-- ------------------------------------------------------------ 11. grants and the live emitters

SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'), 'browser RPC: ' || f)
FROM unnest(ARRAY['public.work_rest_vessel_board(uuid, integer, integer)', 'public.work_rest_month_stats(uuid, integer)',
                  'public.work_rest_vessel_breaches(uuid, date, date, boolean)', 'public.work_rest_review_breach(uuid, text, text)',
                  'public.work_rest_remind(uuid, uuid[], integer, integer)', 'public.work_rest_breach_report_recipients(uuid)',
                  'public.work_rest_breach_report_create(uuid, date, date, uuid[], uuid[], text)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND has_function_privilege('service_role', f, 'EXECUTE'), 'internal: ' || f)
FROM unnest(ARRAY['public.work_rest_send_due_reminders(date)', 'public.work_rest_board_member_ids(uuid, date, date)',
                  'public.work_rest_role_label(uuid, uuid)', 'public.work_rest_is_fleet_hr(uuid, uuid)', 'public.work_rest_is_dpa(uuid, uuid)',
                  'public.work_rest_report_recipient_kind(uuid, uuid)', 'public.work_rest_serious_breach_recipients(uuid)',
                  'public.work_rest_due_members(uuid, integer, integer, date)', 'public.work_rest_reminder_emit(uuid)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('service_role', f, 'EXECUTE'), 'trigger function: ' || f)
FROM unnest(ARRAY['public.work_rest_reminders_scope_guard()', 'public.work_rest_breach_reports_scope_guard()',
                  'public.work_rest_serious_breach_notify()', 'public.work_rest_month_correction_guard()']) AS f;
SELECT tests.ok(has_table_privilege('authenticated', t, 'SELECT') AND NOT has_table_privilege('authenticated', t, 'INSERT')
                AND NOT has_table_privilege('authenticated', t, 'UPDATE') AND NOT has_table_privilege('authenticated', t, 'DELETE')
                AND NOT has_table_privilege('anon', t, 'SELECT'), 'relation: read only for the browser, nothing for anon: ' || t)
FROM unnest(ARRAY['public.work_rest_reminders', 'public.work_rest_breach_reports', 'public.work_rest_breach_reviews']) AS t;
SELECT tests.ok((SELECT prosecdef AND proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = f::regprocedure), 'definer with search_path: ' || f)
FROM unnest(ARRAY['public.work_rest_vessel_board(uuid, integer, integer)', 'public.work_rest_month_stats(uuid, integer)',
                  'public.work_rest_vessel_breaches(uuid, date, date, boolean)', 'public.work_rest_review_breach(uuid, text, text)',
                  'public.work_rest_remind(uuid, uuid[], integer, integer)', 'public.work_rest_breach_report_recipients(uuid)',
                  'public.work_rest_breach_report_create(uuid, date, date, uuid[], uuid[], text)', 'public.work_rest_send_due_reminders(date)']) AS f;
-- D-238: the crew manifest declares these types live; their emitters exist.
SELECT tests.ok(position(format('''%s''', x.t) IN (SELECT prosrc FROM pg_proc WHERE oid = x.f::regprocedure)) > 0, 'live emitter of ' || x.t || ': ' || x.f)
FROM (VALUES ('hor_reminder', 'public.work_rest_reminder_emit(uuid)'),
             ('hor_serious_breach', 'public.work_rest_serious_breach_notify()'),
             ('hor_breach_report', 'public.work_rest_breach_report_create(uuid, date, date, uuid[], uuid[], text)'),
             ('hor_correction_requested', 'public.work_rest_review_breach(uuid, text, text)')) AS x(t, f);
SELECT tests.ok(EXISTS (SELECT 1 FROM public.notification_types WHERE key = t), 'the type is seeded (PP4): ' || t)
FROM unnest(ARRAY['hor_reminder', 'hor_serious_breach', 'hor_breach_report', 'hor_correction_requested']) AS t;
