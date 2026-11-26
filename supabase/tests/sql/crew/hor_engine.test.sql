-- The hours-of-rest server engine (X1-07,
-- 20261124060700_crew_hor_engine.sql; gap/04 C38, C39, C43, C45, C46, W6;
-- DECISIONS D-X1-6, D-X1-9, D-X1-11, D-X1-20):
--   1. parity: every case of src/test/work-rest/fixtures/horCases.json
--      (rules: work_rest_rule_eval; months: work_rest_month_decide) gives
--      the TS engine's answer; the rule wording;
--   2. the schema: settings defaults, the per-vessel month unique, the
--      widened status and signer-role lists, one live signature per role,
--      the breach columns fleet operations reads (R9);
--   3. save gates: own day (create) vs another's (edit + department unless
--      final approve), other department refused, foreign crew, unknown
--      vessel, no assignment that day, future day, Hours of Rest off or not
--      started (C45), invalid blocks, a day on another vessel, inactive and
--      anonymous callers;
--   4. the breaches: stored per day with vessel, month, serious flag,
--      deficit; day summaries; compliance checks; a cross-midnight window;
--      unreviewed breaches deleted and reviewed ones superseded (never
--      deleted) across a correction; a closed month's days untouched; a
--      non-UTC vessel stores real instants;
--   5. fill: copies, limits, all or nothing;
--   6. the month: every legal and illegal pair through the RPC, signatures
--      and stamps, HoD department scope, the HoD step (off / nudge /
--      required), unreviewed breaches (low warns), on behalf only for
--      former crew with a reason (C43), reopen keeps stale signatures and
--      the month is signed again, one's own month, a closed month refuses
--      days, the future;
--   7. two vessels' months for one person in the same month (D-X1-20);
--   8. the write guards: signed-in direct writes to records, blocks,
--      breaches, signatures, compliance checks, the audit log and the
--      month refused; a blank draft allowed; service role and no JWT
--      allowed;
--   9. grants.

SELECT tests.seed_two_tenants();

SELECT (date_trunc('month', current_date) - interval '1 month')::date AS pm1,
       date_trunc('month', current_date)::date AS cm1,
       extract(year FROM date_trunc('month', current_date) - interval '1 month')::integer AS pm_y,
       extract(month FROM date_trunc('month', current_date) - interval '1 month')::integer AS pm_m,
       extract(year FROM date_trunc('month', current_date) - interval '2 months')::integer AS p2_y,
       extract(month FROM date_trunc('month', current_date) - interval '2 months')::integer AS p2_m,
       extract(year FROM date_trunc('month', current_date) - interval '3 months')::integer AS p3_y,
       extract(month FROM date_trunc('month', current_date) - interval '3 months')::integer AS p3_m
\gset

-- ------------------------------------------------------------ world (A.dra unless named)

CREATE OR REPLACE FUNCTION pg_temp.crew(p_key text, p_vessel text, p_title text, p_extra jsonb DEFAULT '{}'::jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tests.seed_user(split_part(p_key, '.', 1), p_key, 'crew');
  PERFORM tests.seed_assignment(p_key, p_vessel, true, p_title, jsonb_build_object('join_date', current_date - 150) || p_extra);
END;
$$;
SELECT pg_temp.crew('A.x17_deck', 'A.dra', 'Deckhand');             -- deck; records own days
SELECT pg_temp.crew('A.x17_pair', 'A.dra', 'Deckhand');             -- deck; the pair matrix
SELECT pg_temp.crew('A.x17_stew', 'A.dra', 'Second Stew');          -- interior
SELECT pg_temp.crew('A.x17_chief_stew', 'A.dra', 'Chief Stew');     -- HoD interior
SELECT pg_temp.crew('A.x17_chief_officer', 'A.dra', 'Chief Officer'); -- HoD deck
SELECT pg_temp.crew('A.x17_viewer', 'A.dra', 'Deckhand');           -- no hours-of-rest rights
SELECT pg_temp.crew('A.x17_gone', 'A.dra', 'Deckhand', jsonb_build_object('leave_date', current_date - 5, 'is_current', false));
SELECT tests.seed_user('A', 'A.x17_transfer', 'crew');
SELECT tests.seed_assignment('A.x17_transfer', 'A.hyd', false, 'Deckhand',
  jsonb_build_object('join_date', current_date - 150, 'leave_date', :'pm1'::date + 14, 'is_current', false));
SELECT tests.seed_assignment('A.x17_transfer', 'A.dra', true, 'Deckhand', jsonb_build_object('join_date', :'pm1'::date + 15));
UPDATE public.crew_assignments SET join_date = current_date - 150 WHERE id = tests.id('assignment:A.crew_hyd@A.hyd');
UPDATE public.crew_assignments SET join_date = current_date - 150 WHERE id = tests.id('assignment:A.master_dra@A.dra');
SELECT tests.seed_assignment('A.disabled', 'A.dra', true, 'Deckhand', jsonb_build_object('join_date', current_date - 150));
SELECT tests.seed_user('B', 'B.x17_crew', 'crew');
SELECT tests.seed_assignment('B.x17_crew', 'B.lev', true, 'Deckhand', jsonb_build_object('join_date', current_date - 150));

SELECT tests.seed_role('x17_crew', 'vessel');
SELECT tests.seed_role('x17_hod', 'vessel');
SELECT tests.seed_role('x17_master', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, x.k, x.p::public.permission_level, 'vessel'
FROM (VALUES ('x17_crew', 'crew_roster', 'view'),
             ('x17_hod', 'crew_roster', 'edit'), ('x17_hod', 'crew.approve_hours_of_rest', 'view'),
             ('x17_master', 'crew_roster', 'admin')) AS x(r, k, p)
JOIN public.roles AS r ON r.name = x.r;
SELECT tests.seed_rbac_role(k, 'x17_crew', 'A.dra')
FROM unnest(ARRAY['A.x17_deck', 'A.x17_pair', 'A.x17_stew', 'A.x17_gone', 'A.x17_transfer', 'A.disabled']) AS k;
SELECT tests.seed_rbac_role('A.x17_transfer', 'x17_crew', 'A.hyd');
SELECT tests.seed_rbac_role('A.crew_hyd', 'x17_crew', 'A.hyd');
SELECT tests.seed_rbac_role('B.x17_crew', 'x17_crew', 'B.lev');
SELECT tests.seed_rbac_role(k, 'x17_hod', 'A.dra') FROM unnest(ARRAY['A.x17_chief_stew', 'A.x17_chief_officer']) AS k;
SELECT tests.seed_rbac_role('A.master_dra', 'x17_master', 'A.dra');

-- Work periods from hours: pg_temp.w(6, 22) = 06:00-22:00; pg_temp.w(0, 5, 10, 15) = two periods.
CREATE OR REPLACE FUNCTION pg_temp.w(VARIADIC p numeric[]) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('block_type', 'work', 'start_minute', round(p[i] * 60)::integer, 'end_minute', round(p[i + 1] * 60)::integer) ORDER BY i), '[]'::jsonb)
  FROM generate_series(1, coalesce(array_length(p, 1), 0), 2) AS i
$$;
CREATE OR REPLACE FUNCTION pg_temp.save(p_vessel text, p_crew text, p_day date, p_blocks jsonb, p_note text DEFAULT NULL) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.work_rest_save_day(%L::uuid, %L::uuid, %L::date, %L::jsonb, %L)', tests.vessel_id(p_vessel), tests.user_id(p_crew), p_day, p_blocks, p_note)
$$;
CREATE OR REPLACE FUNCTION pg_temp.tr(p_vessel text, p_crew text, p_year integer, p_month integer, p_action text, p_reason text DEFAULT NULL, p_text text DEFAULT NULL) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.work_rest_month_transition(%L::uuid, %L::uuid, %s, %s, %L, %L, %L)', tests.vessel_id(p_vessel), tests.user_id(p_crew), p_year, p_month, p_action, p_reason, p_text)
$$;
CREATE OR REPLACE FUNCTION pg_temp.month_id(p_vessel text, p_crew text, p_year integer, p_month integer) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT s.id FROM public.work_rest_monthly_submissions AS s
  WHERE s.crew_id = tests.user_id(p_crew) AND s.vessel_id = tests.vessel_id(p_vessel) AND s.period_year = p_year AND s.period_month = p_month
$$;
CREATE OR REPLACE FUNCTION pg_temp.status(p_vessel text, p_crew text, p_year integer, p_month integer) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT s.status FROM public.work_rest_monthly_submissions AS s WHERE s.id = pg_temp.month_id(p_vessel, p_crew, p_year, p_month)
$$;
CREATE OR REPLACE FUNCTION pg_temp.live(p_crew text, p_day date, p_rule text) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*) FROM public.work_rest_non_conformities AS n
  WHERE n.crew_id = tests.user_id(p_crew) AND n.breach_day = p_day AND n.rule_code = p_rule AND n.superseded_at IS NULL
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

-- Setup checks.
SELECT tests.ok(public.has_capability_for(tests.user_id('A.x17_deck'), 'vessel.crew.hours_of_rest.create', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x17_deck'), 'vessel.crew.hours_of_rest.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x17_viewer'), 'vessel.crew.hours_of_rest.create', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x17_chief_officer'), 'vessel.crew.hours_of_rest.edit', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.x17_chief_officer'), 'vessel.crew.hours_of_rest.approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND NOT public.has_capability_for(tests.user_id('A.x17_chief_officer'), 'vessel.crew.hours_of_rest.final_approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.master_dra'), 'vessel.crew.hours_of_rest.final_approve', tests.company_id('A'), tests.vessel_id('A.dra'))
                AND public.has_capability_for(tests.user_id('A.fleet_manager'), 'vessel.crew.hours_of_rest.final_approve', tests.company_id('A'), tests.vessel_id('A.hyd')),
  'setup: crew create only; the viewer nothing; the heads of department edit and approve; the master and the fleet manager final-approve');
SELECT tests.results_eq(
  $q$SELECT k, public.work_rest_department_on(tests.profile_id(k), tests.vessel_id('A.dra'), current_date, current_date)
     FROM unnest(ARRAY['A.x17_deck', 'A.x17_stew', 'A.x17_chief_stew', 'A.x17_chief_officer']) AS k$q$,
  $q$VALUES ('A.x17_deck', 'deck'), ('A.x17_stew', 'interior'), ('A.x17_chief_stew', 'interior'), ('A.x17_chief_officer', 'deck')$q$,
  'setup: departments come from the positions');
SELECT tests.is(public.work_rest_department_on(tests.profile_id('A.x17_gone'), tests.vessel_id('A.dra'), current_date, current_date), NULL,
  'a former crew member has no department today');
SELECT tests.is(public.work_rest_department_on(tests.profile_id('A.x17_gone'), tests.vessel_id('A.dra'), :'pm1'::date, :'pm1'::date + 27), 'deck',
  '... but has one in the month they were aboard');

-- ------------------------------------------------------------ 1. parity

\set cases `cat src/test/work-rest/fixtures/horCases.json`
CREATE TEMP TABLE hcase ON COMMIT DROP AS SELECT x AS c FROM jsonb_array_elements(:'cases'::jsonb -> 'rules') AS x;
CREATE TEMP TABLE mcase ON COMMIT DROP AS SELECT x AS c FROM jsonb_array_elements(:'cases'::jsonb -> 'months') AS x;
CREATE TEMP TABLE hdefaults ON COMMIT DROP AS SELECT :'cases'::jsonb #> '{defaults,rules}' AS r;
SELECT tests.ok((SELECT count(*) FROM hcase) >= 30 AND (SELECT count(*) FROM mcase) >= 90, 'parity: the fixture holds the rule and month cases');
SELECT tests.is(
  public.work_rest_rule_eval(h.c -> 'days', d.r || coalesce(h.c -> 'rules', '{}'::jsonb), (h.c #>> '{range,from}')::date, (h.c #>> '{range,to}')::date),
  h.c -> 'expect',
  'rule parity: ' || (h.c ->> 'name'))
FROM hcase AS h, hdefaults AS d
ORDER BY h.c ->> 'name';
SELECT tests.is_empty(
  $q$SELECT m.c ->> 'name' FROM mcase AS m WHERE public.work_rest_month_decide(m.c ->> 'status', m.c ->> 'action', m.c -> 'facts') IS DISTINCT FROM m.c -> 'expect'$q$,
  'month parity: every case of horCases.json months decides as decideMonthAction');
SELECT tests.results_eq(
  $q$SELECT t.description, t.correction FROM public.work_rest_rule_text('REST_24H_MIN', '{"min_rest_24h": 10.5}'::jsonb) AS t$q$,
  $q$VALUES ('Rest below 10.5 hours in a 24-hour period.', 'Reduce work hours or rearrange shifts so rest in any 24h period is ≥ 10.5h.')$q$,
  'the rule wording matches describeRule (trailing zeros trimmed)');

-- ------------------------------------------------------------ 2. schema

SELECT tests.results_eq(
  $q$SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'vessel_work_rest_settings'
       AND column_name IN ('warning_margin_24h_h', 'warning_margin_7d_h', 'serious_24h_h', 'serious_7d_h', 'hod_step', 'auto_reminders')
     ORDER BY column_name$q$,
  $q$VALUES ('true'), ('''nudge''::text'), ('50'), ('4'), ('1'), ('3')$q$,
  'settings: margins 1 h / 3 h, serious 4 h / 50 h, HoD step nudge, automatic reminders on');
SELECT tests.ok(
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.work_rest_monthly_submissions'::regclass
              AND conname = 'work_rest_monthly_submissions_crew_id_period_year_period_month_key')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.work_rest_monthly_submissions'::regclass
              AND conname = 'work_rest_monthly_submissions_crew_vessel_period_key' AND contype = 'u'),
  'D-X1-20: the month is unique per crew member and vessel (the per-person unique is gone)');
SELECT tests.ok(
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.work_rest_signatures'::regclass AND contype = 'u')
  AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'work_rest_signatures_live_role' AND indexdef LIKE '%WHERE (stale_at IS NULL)%'),
  'signatures: one live signature per role (partial unique), stale ones kept');
SELECT tests.ok(pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'work_rest_signatures_signer_role_known')) LIKE '%company%'
                AND pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'work_rest_monthly_submissions_status_known')) LIKE '%approved%',
  'the signer role list has company; the status list has approved');
SELECT tests.results_eq(
  $q$SELECT column_name::text, data_type::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'work_rest_non_conformities'
       AND column_name IN ('review_outcome', 'is_serious', 'superseded_at', 'deficit_hours', 'breach_day', 'vessel_id')
     ORDER BY 1$q$,
  $q$VALUES ('breach_day', 'date'), ('deficit_hours', 'numeric'), ('is_serious', 'boolean'), ('review_outcome', 'text'),
            ('superseded_at', 'timestamp with time zone'), ('vessel_id', 'uuid')$q$,
  'breaches carry the columns fleet operations reads (R9: review_outcome, is_serious, superseded_at)');

-- ------------------------------------------------------------ 3. save gates

SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 1, pg_temp.w(8, 18)), 'own day: a crew member records their day');
SELECT tests.is((SELECT count(*) FROM public.work_rest_records WHERE crew_id = tests.user_id('A.x17_deck') AND record_date = :'pm1'::date + 1), 1::bigint,
  '... the record is there');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_stew', :'pm1'::date + 1, pg_temp.w(8, 18)), '42501', 'not_permitted',
  'another person''s day needs hours_of_rest.edit');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date - 200, pg_temp.w(8, 18)), '22023', 'not_on_vessel',
  'a day before the assignment is refused');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', current_date + 2, pg_temp.w(8, 18)), '22023', 'day_in_future',
  'a day after tomorrow is refused');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 2, pg_temp.w(8, 12, 11, 14)), '22023', 'blocks_overlap',
  'overlapping work periods are refused');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 2, '[{"block_type": "rest", "start_minute": 0, "end_minute": 60}]'), '22023', 'blocks_invalid',
  'a rest block is refused (unmarked time is rest)');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 2, '[{"start_minute": 600, "end_minute": 600}]'), '22023', 'blocks_invalid',
  'an empty work period is refused');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 2, '[{"start_minute": 600, "end_minute": 1500}]'), '22023', 'blocks_invalid',
  'a work period past midnight is refused');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 2, '{"start_minute": 600}'), '22023', 'blocks_invalid',
  'blocks must be an array');
SELECT tests.throws_like(format('SELECT public.work_rest_save_day(%L::uuid, %L::uuid, %L::date, %L::jsonb)', tests.id('no vessel'), tests.user_id('A.x17_deck'), :'pm1'::date, '[]'),
  'P0002', 'vessel_not_found', 'an unknown vessel is P0002');
SELECT tests.throws_like(pg_temp.save('A.hyd', 'A.x17_deck', :'pm1'::date + 1, pg_temp.w(8, 18)), '42501', 'not_permitted',
  'a vessel the crew member does not reach is refused');

SELECT tests.as_user(tests.user_id('A.x17_viewer'));
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_viewer', :'pm1'::date + 1, pg_temp.w(8, 18)), '42501', 'not_permitted',
  'own day without hours_of_rest.create is refused');

SELECT tests.as_user(tests.user_id('A.x17_chief_officer'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 3, pg_temp.w(8, 18)), 'the deck head of department records a deckhand''s day');
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_stew', :'pm1'::date + 3, pg_temp.w(8, 18)), '42501', 'out_of_department',
  'a head of department may not change another department''s day');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_stew', :'pm1'::date + 3, pg_temp.w(8, 18)), 'the final approver changes any department''s day');
SELECT tests.throws_like(pg_temp.save('A.dra', 'B.x17_crew', :'pm1'::date + 3, pg_temp.w(8, 18)), '42501', 'crew_not_in_company',
  'a crew member of another company is refused (D-246)');
SELECT tests.throws_like(pg_temp.save('B.lev', 'B.x17_crew', :'pm1'::date + 3, pg_temp.w(8, 18)), '42501', 'not_permitted',
  'another company''s vessel is refused');
SELECT tests.throws_like(format('SELECT public.work_rest_save_day(%L::uuid, %L::uuid, %L::date, %L::jsonb)', tests.vessel_id('A.dra'), tests.id('nobody'), :'pm1'::date, '[]'),
  'P0002', 'crew_not_found', 'an unknown crew member is P0002');

SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 3, pg_temp.w(8, 18)), '42501', 'not_permitted',
  'another tenant''s administrator is refused');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.disabled', :'pm1'::date + 3, pg_temp.w(8, 18)), '42501', 'not_permitted',
  'an inactive crew member is refused');
SELECT tests.as_anon();
SELECT tests.throws(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 3, pg_temp.w(8, 18)), '42501', 'anon cannot call the RPC');

-- Hours of Rest off, or not started yet on the day (C45).
SELECT tests.reset_role();
INSERT INTO public.vessel_module_settings (vessel_id, company_id, module_key, enabled, enabled_from)
VALUES (tests.vessel_id('A.dra'), tests.company_id('A'), 'crew_hor', true, :'pm1'::date + 20);
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 19, pg_temp.w(8, 18)), '22023', 'hor_not_on',
  'C45: a day before the vessel''s Hours of Rest start date is refused');
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 20, pg_temp.w(8, 18)), '... the start date itself is recorded');
SELECT tests.reset_role();
UPDATE public.vessel_module_settings SET enabled = false, enabled_from = NULL WHERE vessel_id = tests.vessel_id('A.dra') AND module_key = 'crew_hor';
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 21, pg_temp.w(8, 18)), '22023', 'hor_not_on',
  'Hours of Rest switched off refuses every day');
SELECT tests.reset_role();
DELETE FROM public.vessel_module_settings WHERE vessel_id = tests.vessel_id('A.dra');

-- ------------------------------------------------------------ 4. breaches

SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT pg_temp.keep('save_breach', pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 5, pg_temp.w(6, 22), 'Long day'));
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT rule_code, severity, measured_value, threshold_value, deficit_hours, is_serious, vessel_id = %L, submission_id = %L
            FROM public.work_rest_non_conformities WHERE crew_id = %L AND breach_day = %L AND superseded_at IS NULL ORDER BY rule_code$q$,
         tests.vessel_id('A.dra'), pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m), tests.user_id('A.x17_deck'), :'pm1'::date + 5),
  $q$VALUES ('REST_24H_MIN', 'medium', 8.00, 10.00, 2.00, false, true, true),
            ('REST_INTERVAL_MAX', 'high', 16.00, 14.00, NULL::numeric, false, true, true)$q$,
  'a 16 h day stores its breaches with the vessel, the month, the deficit and the serious flag');
SELECT tests.ok((SELECT (r -> 'changes' ->> 'inserted')::integer >= 2 AND jsonb_array_length(r -> 'breaches') = 2 AND (r #>> '{day,rest_minutes}')::integer = 480
                 FROM rpc_out WHERE k = 'save_breach'),
  'the RPC answers the stored summary, the day''s breaches and the counts');
SELECT tests.results_eq(
  format($q$SELECT total_work_minutes, total_rest_minutes, longest_rest_minutes, rest_period_count, is_compliant, notes
            FROM public.work_rest_records WHERE crew_id = %L AND record_date = %L$q$, tests.user_id('A.x17_deck'), :'pm1'::date + 5),
  $q$VALUES (960, 480, 360, 2, false, 'Long day')$q$,
  'the server writes the day''s summary columns');
SELECT tests.results_eq(
  format($q$SELECT check_window, rest_minutes, passes, threshold_minutes, window_start = (%L::date)::timestamp AT TIME ZONE 'UTC'
            FROM public.work_rest_compliance_checks WHERE crew_id = %L AND window_end > (%L::date)::timestamp AT TIME ZONE 'UTC'
              AND window_end <= (%L::date + 1)::timestamp AT TIME ZONE 'UTC' ORDER BY check_window$q$,
         :'pm1'::date + 5, tests.user_id('A.x17_deck'), :'pm1'::date + 5, :'pm1'::date + 5),
  $q$VALUES ('rolling_24h', 480, false, 600, true)$q$,
  'one rolling_24h compliance check for the day (no 7-day window is wholly recorded yet)');
SELECT tests.is((SELECT count(*) FROM public.work_rest_audit_log WHERE crew_id = tests.user_id('A.x17_deck') AND action = 'day_saved'), 4::bigint,
  'every saved day writes an audit row');

-- A late finish and an early start: the next day's 24 h window across midnight.
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 6, pg_temp.w(8, 18)), 'save the next day');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT measured_value, (window_start AT TIME ZONE 'UTC'), (window_end AT TIME ZONE 'UTC')
            FROM public.work_rest_non_conformities WHERE crew_id = %L AND breach_day = %L AND rule_code = 'REST_24H_MIN' AND superseded_at IS NULL$q$,
         tests.user_id('A.x17_deck'), :'pm1'::date + 6),
  format($q$VALUES (8.00, (%L::date + 0)::timestamp + interval '6 hours', (%L::date + 1)::timestamp + interval '6 hours')$q$, :'pm1'::date + 5, :'pm1'::date + 5),
  'the window across midnight (06:00 to 06:00) is a breach of the next day');

-- Correcting the day: the unreviewed breaches go; a reviewed one is kept and superseded.
UPDATE public.work_rest_non_conformities SET review_outcome = 'correction_requested', review_note = 'Check the 5th', reviewed_by = tests.user_id('A.master_dra'), reviewed_at = now()
WHERE crew_id = tests.user_id('A.x17_deck') AND breach_day = :'pm1'::date + 5 AND rule_code = 'REST_24H_MIN';
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 5, pg_temp.w(8, 18)), 'the crew member corrects the day');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT rule_code, review_outcome, superseded_at IS NOT NULL FROM public.work_rest_non_conformities
            WHERE crew_id = %L AND breach_day IN (%L, %L) ORDER BY breach_day, rule_code$q$,
         tests.user_id('A.x17_deck'), :'pm1'::date + 5, :'pm1'::date + 6),
  $q$VALUES ('REST_24H_MIN', 'correction_requested', true)$q$,
  'the reviewed breach is superseded (never deleted); the unreviewed interval and next-day breaches are gone');
SELECT tests.is((SELECT is_compliant FROM public.work_rest_records WHERE crew_id = tests.user_id('A.x17_deck') AND record_date = :'pm1'::date + 6), true,
  'the next day is compliant again');

-- The breach returns with other figures: a new unreviewed row; the earlier review stays superseded.
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 5, pg_temp.w(6, 21)), 'the day changes again (9 h of rest)');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT measured_value, review_outcome, superseded_at IS NOT NULL FROM public.work_rest_non_conformities
            WHERE crew_id = %L AND breach_day = %L AND rule_code = 'REST_24H_MIN' ORDER BY created_at, superseded_at NULLS LAST$q$,
         tests.user_id('A.x17_deck'), :'pm1'::date + 5),
  $q$VALUES (8.00, 'correction_requested', true), (9.00, NULL, false)$q$,
  'a new breach is a new unreviewed row beside the superseded review');
-- A reviewed breach whose figures do not change is kept as it is.
UPDATE public.work_rest_non_conformities SET review_outcome = 'accepted', review_note = 'Emergency drill', reviewed_by = tests.user_id('A.master_dra')
WHERE crew_id = tests.user_id('A.x17_deck') AND breach_day = :'pm1'::date + 5 AND rule_code = 'REST_24H_MIN' AND superseded_at IS NULL;
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 5, pg_temp.w(6, 21), 'Drill'), 'the same work saved again (a note only)');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.work_rest_non_conformities WHERE crew_id = tests.user_id('A.x17_deck') AND breach_day = :'pm1'::date + 5
                 AND rule_code = 'REST_24H_MIN' AND review_outcome = 'accepted' AND superseded_at IS NULL), 1::bigint,
  'the accepted breach with the same figures stays live and reviewed');
-- A reviewed breach whose figures change is superseded and a new one opens.
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 5, pg_temp.w(6, 23)), 'the day changes (7 h of rest)');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT measured_value, review_outcome FROM public.work_rest_non_conformities
            WHERE crew_id = %L AND breach_day = %L AND rule_code = 'REST_24H_MIN' AND superseded_at IS NULL$q$, tests.user_id('A.x17_deck'), :'pm1'::date + 5),
  $q$VALUES (7.00, NULL::text)$q$,
  'the changed breach is a new unreviewed row; the accepted one is superseded');
SELECT tests.is((SELECT count(*) FROM public.work_rest_non_conformities WHERE crew_id = tests.user_id('A.x17_deck') AND breach_day = :'pm1'::date + 5
                 AND rule_code = 'REST_24H_MIN' AND superseded_at IS NOT NULL), 2::bigint,
  'both earlier reviews are kept');

-- A serious breach and the 7-day rule across a wholly recorded week.
SELECT tests.as_user(tests.user_id('A.x17_stew'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_stew', :'pm1'::date + d, pg_temp.w(0, 18)), 'the stew records day ' || d)
FROM generate_series(8, 14) AS d;
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT rule_code, severity, is_serious, measured_value, deficit_hours FROM public.work_rest_non_conformities
            WHERE crew_id = %L AND breach_day = %L AND rule_code IN ('REST_24H_MIN', 'REST_7D_MIN') AND superseded_at IS NULL ORDER BY rule_code$q$,
         tests.user_id('A.x17_stew'), :'pm1'::date + 14),
  $q$VALUES ('REST_24H_MIN', 'high', false, 6.00, 4.00), ('REST_7D_MIN', 'critical', true, 42.00, 35.00)$q$,
  'seven days of 6 h rest: a serious, critical 7-day breach on the seventh day');
SELECT tests.is((SELECT count(*) FROM public.work_rest_compliance_checks WHERE crew_id = tests.user_id('A.x17_stew') AND check_window = 'rolling_7d'), 1::bigint,
  'the seventh day has its rolling_7d check');
SELECT tests.is((SELECT open_non_conformities FROM public.work_rest_monthly_submissions WHERE id = pg_temp.month_id('A.dra', 'A.x17_stew', :pm_y, :pm_m)),
                (SELECT count(*)::integer FROM public.work_rest_non_conformities WHERE submission_id = pg_temp.month_id('A.dra', 'A.x17_stew', :pm_y, :pm_m) AND superseded_at IS NULL),
  'the month counts its open breaches');
SELECT tests.ok((SELECT total_work_hours = 136 AND NOT is_compliant FROM public.work_rest_monthly_submissions WHERE id = pg_temp.month_id('A.dra', 'A.x17_stew', :pm_y, :pm_m)),
  'the month totals the hours of its days (10 h and seven days of 18 h) and is not compliant');

-- A closed month keeps what it was submitted with: a save next door does not rewrite it.
SELECT tests.as_user(tests.user_id('A.x17_stew'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_stew', :'cm1'::date - 1, pg_temp.w(6, 22)), 'the stew records the last day of the month');
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x17_stew', :pm_y, :pm_m, 'submit'), '... and submits the month');
SELECT tests.reset_role();
CREATE TEMP TABLE closed_before ON COMMIT DROP AS
SELECT (SELECT longest_rest_minutes FROM public.work_rest_records WHERE crew_id = tests.user_id('A.x17_stew') AND record_date = :'cm1'::date - 1) AS longest,
       (SELECT count(*) FROM public.work_rest_non_conformities WHERE crew_id = tests.user_id('A.x17_stew') AND breach_day = :'cm1'::date - 1 AND superseded_at IS NULL) AS ncs;
SELECT tests.as_user(tests.user_id('A.x17_stew'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_stew', :'cm1'::date, pg_temp.w(8, 18)), 'the stew records the first day of the next month');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT r.record_date, r.longest_rest_minutes FROM public.work_rest_records AS r WHERE r.crew_id = %L AND r.record_date IN (%L, %L) ORDER BY 1$q$,
         tests.user_id('A.x17_stew'), :'cm1'::date - 1, :'cm1'::date),
  format($q$VALUES (%L::date, 360), (%L::date, 600)$q$, :'cm1'::date - 1, :'cm1'::date),
  'the new day counts the night rest across the month end whole (10 h); the submitted day keeps its stored summary (6 h)');
SELECT tests.is((SELECT count(*) FROM public.work_rest_non_conformities WHERE crew_id = tests.user_id('A.x17_stew') AND breach_day = :'cm1'::date - 1 AND superseded_at IS NULL),
                (SELECT ncs FROM closed_before), 'the submitted day''s breaches are untouched');

-- A non-UTC vessel: the breach windows are the vessel's local times.
INSERT INTO public.vessel_work_rest_settings (vessel_id, timezone) VALUES (tests.vessel_id('A.hyd'), 'Pacific/Auckland');
INSERT INTO public.vessel_work_rest_settings (vessel_id, timezone) VALUES (tests.vessel_id('A.gam'), 'Mars/Olympus');
SELECT tests.is(public.work_rest_vessel_tz(tests.vessel_id('A.hyd')), 'Pacific/Auckland', 'the vessel''s zone is read from its settings');
SELECT tests.is(public.work_rest_vessel_tz(tests.vessel_id('A.gam')), 'UTC', 'an unknown zone falls back to UTC');
SELECT tests.is(public.work_rest_vessel_tz(tests.vessel_id('B.lev')), 'UTC', 'no settings: UTC');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.lives(pg_temp.save('A.hyd', 'A.crew_hyd', :'pm1'::date + 5, pg_temp.w(6, 22)), 'a HYDRA crew member records a 16 h day');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT window_start AT TIME ZONE 'Pacific/Auckland', window_end AT TIME ZONE 'Pacific/Auckland',
                   window_start = (%L::date)::timestamp AT TIME ZONE 'Pacific/Auckland'
            FROM public.work_rest_non_conformities WHERE crew_id = %L AND rule_code = 'REST_24H_MIN' AND superseded_at IS NULL$q$,
         :'pm1'::date + 5, tests.user_id('A.crew_hyd')),
  format($q$VALUES ((%L::date)::timestamp, (%L::date + 1)::timestamp, true)$q$, :'pm1'::date + 5, :'pm1'::date + 5),
  'the stored window is midnight to midnight in the vessel''s zone, not UTC');
SELECT tests.ok((SELECT window_start <> (:'pm1'::date)::timestamp AT TIME ZONE 'UTC' + interval '5 days'
                 FROM public.work_rest_non_conformities WHERE crew_id = tests.user_id('A.crew_hyd') AND rule_code = 'REST_24H_MIN' AND superseded_at IS NULL),
  '... which is another instant than midnight UTC');

-- A day already recorded on another vessel.
SELECT tests.as_user(tests.user_id('A.x17_transfer'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_transfer', :'pm1'::date + 16, pg_temp.w(8, 18)), 'the transferred crew member records a DRAAK day');
SELECT tests.reset_role();
INSERT INTO public.work_rest_records (crew_id, vessel_id, record_date) VALUES (tests.user_id('A.x17_transfer'), tests.vessel_id('A.hyd'), :'pm1'::date + 15);
UPDATE public.crew_assignments SET join_date = :'pm1'::date + 14 WHERE id = tests.id('assignment:A.x17_transfer@A.dra');
SELECT tests.as_user(tests.user_id('A.x17_transfer'));
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_transfer', :'pm1'::date + 15, pg_temp.w(8, 18)), '22023', 'day_on_other_vessel',
  'a day recorded on another vessel is refused');
SELECT tests.reset_role();
UPDATE public.crew_assignments SET join_date = :'pm1'::date + 15 WHERE id = tests.id('assignment:A.x17_transfer@A.dra');

-- ------------------------------------------------------------ 5. fill

SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT pg_temp.keep('fill', format('SELECT public.work_rest_fill_days(%L::uuid, %L::uuid, %L::date, %L::date[])',
  tests.vessel_id('A.dra'), tests.user_id('A.x17_deck'), :'pm1'::date + 1, ARRAY[:'pm1'::date + 9, :'pm1'::date + 10, :'pm1'::date + 11]));
SELECT tests.reset_role();
SELECT tests.is((SELECT (r ->> 'filled')::integer FROM rpc_out WHERE k = 'fill'), 3, 'fill copies the source day onto three days');
SELECT tests.is((SELECT count(*) FROM public.work_rest_blocks AS b JOIN public.work_rest_records AS r ON r.id = b.record_id
                 WHERE r.crew_id = tests.user_id('A.x17_deck') AND r.record_date BETWEEN :'pm1'::date + 9 AND :'pm1'::date + 11
                   AND b.start_minute = 480 AND b.end_minute = 1080), 3::bigint,
  '... with the source''s work periods');
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.throws_like(format('SELECT public.work_rest_fill_days(%L::uuid, %L::uuid, %L::date, %L::date[])', tests.vessel_id('A.dra'), tests.user_id('A.x17_deck'),
  :'pm1'::date + 1, (SELECT array_agg(:'pm1'::date - 40 + i) FROM generate_series(0, 31) AS i)), '22023', 'too_many_targets', 'at most 31 days');
SELECT tests.throws_like(format('SELECT public.work_rest_fill_days(%L::uuid, %L::uuid, %L::date, %L::date[])', tests.vessel_id('A.dra'), tests.user_id('A.x17_deck'),
  :'pm1'::date + 1, ARRAY[:'pm1'::date + 1, :'pm1'::date + 2]), '22023', 'targets_invalid', 'the source day is not a target');
SELECT tests.throws_like(format('SELECT public.work_rest_fill_days(%L::uuid, %L::uuid, %L::date, %L::date[])', tests.vessel_id('A.dra'), tests.user_id('A.x17_deck'),
  :'pm1'::date + 1, ARRAY[:'pm1'::date + 2, :'pm1'::date + 2]), '22023', 'targets_invalid', 'a target given twice is refused');
SELECT tests.throws_like(format('SELECT public.work_rest_fill_days(%L::uuid, %L::uuid, %L::date, %L::date[])', tests.vessel_id('A.dra'), tests.user_id('A.x17_deck'),
  :'pm1'::date + 25, ARRAY[:'pm1'::date + 24]), '22023', 'source_not_entered', 'the source day must have an entry');
SELECT tests.throws_like(format('SELECT public.work_rest_fill_days(%L::uuid, %L::uuid, %L::date, %L::date[])', tests.vessel_id('A.dra'), tests.user_id('A.x17_deck'),
  :'pm1'::date + 1, ARRAY[:'pm1'::date + 24, current_date + 5]), '22023', 'day_in_future', 'every target passes the day gate (all or nothing)');
SELECT tests.is((SELECT count(*) FROM public.work_rest_records WHERE crew_id = tests.user_id('A.x17_deck') AND record_date = :'pm1'::date + 24), 0::bigint,
  '... and the refused fill wrote nothing');

-- ------------------------------------------------------------ 6. the month

-- 6a. Every pair of status and action through the RPC (the facts allow the action; the state decides).
CREATE TEMP TABLE pair_out (status text, action text, outcome text) ON COMMIT DROP;
GRANT ALL ON pair_out TO authenticated;
DO $$
DECLARE
  v_status text;
  v_action text;
  v_crew text;
  v_actor text;
  v_month uuid;
  v_out jsonb;
  v_y integer := extract(year FROM date_trunc('month', current_date) - interval '2 months')::integer;
  v_m integer := extract(month FROM date_trunc('month', current_date) - interval '2 months')::integer;
BEGIN
  FOREACH v_status IN ARRAY ARRAY['draft', 'submitted', 'crew_signed', 'hod_reviewed', 'hod_signed', 'captain_reviewed', 'approved', 'locked', 'reopened'] LOOP
    FOREACH v_action IN ARRAY ARRAY['submit', 'submit_on_behalf', 'hod_sign', 'approve', 'lock', 'reopen'] LOOP
      v_crew := CASE WHEN v_action = 'submit_on_behalf' THEN 'A.x17_gone' ELSE 'A.x17_pair' END;
      v_actor := CASE v_action WHEN 'submit' THEN 'A.x17_pair' WHEN 'hod_sign' THEN 'A.x17_chief_officer' ELSE 'A.master_dra' END;
      PERFORM tests.reset_role();
      v_month := public.work_rest_month_row(tests.user_id(v_crew), tests.vessel_id('A.dra'), v_y, v_m);
      DELETE FROM public.work_rest_signatures WHERE submission_id = v_month;
      UPDATE public.work_rest_monthly_submissions SET status = v_status WHERE id = v_month;
      PERFORM tests.as_user(tests.user_id(v_actor));
      BEGIN
        EXECUTE format('SELECT public.work_rest_month_transition(%L::uuid, %L::uuid, %s, %s, %L, %L)',
                       tests.vessel_id('A.dra'), tests.user_id(v_crew), v_y, v_m, v_action, 'A reason.') INTO v_out;
        INSERT INTO pair_out VALUES (v_status, v_action, 'ok:' || (v_out ->> 'status'));
      EXCEPTION WHEN others THEN
        INSERT INTO pair_out VALUES (v_status, v_action, SQLSTATE || ':' || SQLERRM);
      END;
    END LOOP;
  END LOOP;
  PERFORM tests.reset_role();
END
$$;
SELECT tests.results_eq(
  $q$SELECT status, action, outcome FROM pair_out WHERE outcome LIKE 'ok:%'$q$,
  $q$VALUES ('draft', 'submit', 'ok:submitted'), ('draft', 'submit_on_behalf', 'ok:submitted'),
            ('reopened', 'submit', 'ok:submitted'), ('reopened', 'submit_on_behalf', 'ok:submitted'),
            ('submitted', 'hod_sign', 'ok:hod_signed'), ('crew_signed', 'hod_sign', 'ok:hod_signed'),
            ('submitted', 'approve', 'ok:approved'), ('crew_signed', 'approve', 'ok:approved'),
            ('hod_signed', 'approve', 'ok:approved'), ('hod_reviewed', 'approve', 'ok:approved'),
            ('approved', 'lock', 'ok:locked'), ('captain_reviewed', 'lock', 'ok:locked'),
            ('submitted', 'reopen', 'ok:reopened'), ('crew_signed', 'reopen', 'ok:reopened'),
            ('hod_signed', 'reopen', 'ok:reopened'), ('hod_reviewed', 'reopen', 'ok:reopened'),
            ('approved', 'reopen', 'ok:reopened'), ('captain_reviewed', 'reopen', 'ok:reopened'),
            ('locked', 'reopen', 'ok:reopened')$q$,
  'every legal pair moves the month (legacy statuses read as the engine''s)');
SELECT tests.is_empty($q$SELECT status, action, outcome FROM pair_out WHERE outcome NOT LIKE 'ok:%' AND outcome <> '22023:illegal_transition'$q$,
  'every illegal pair is 22023 illegal_transition');
SELECT tests.is((SELECT count(*) FROM pair_out), 54::bigint, '9 statuses x 6 actions');

-- 6b. Submit, HoD, approve, lock, reopen, with signatures and stamps (the previous month of the deckhand).
SELECT tests.as_user(tests.user_id('A.x17_chief_officer'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'submit'), '42501', 'not_own_month', 'only the crew member submits their month');
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT pg_temp.keep('submit', pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'submit'));
SELECT tests.reset_role();
SELECT tests.ok((SELECT r ->> 'status' = 'submitted' AND r -> 'warnings' ? 'days_not_entered' FROM rpc_out WHERE k = 'submit'),
  'submit: submitted, with a warning for the days not entered');
SELECT tests.results_eq(
  format($q$SELECT s.status, s.submitted_by = %L, s.crew_signed_at IS NOT NULL, g.signer_role, g.signature_method, g.signature_payload ->> 'statement'
            FROM public.work_rest_monthly_submissions AS s JOIN public.work_rest_signatures AS g ON g.submission_id = s.id WHERE s.id = %L$q$,
         tests.user_id('A.x17_deck'), pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m)),
  $q$VALUES ('submitted', true, true, 'crew', 'electronic', 'I confirm these records of my hours of work and rest are accurate.')$q$,
  'submit records the crew signature (electronic) and the stamps');
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.throws_like(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 2, pg_temp.w(8, 18)), '22023', 'month_closed', 'a submitted month refuses days');
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'approve'), '42501', 'not_permitted', 'the crew member cannot approve');
SELECT tests.as_user(tests.user_id('A.x17_chief_stew'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'hod_sign'), '42501', 'out_of_department', 'another department''s head may not sign');
SELECT tests.as_user(tests.user_id('A.x17_chief_officer'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'approve'), '42501', 'not_permitted', 'a head of department cannot approve');
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'hod_sign'), 'the deck head of department signs');
SELECT tests.reset_role();
SELECT tests.is(pg_temp.status('A.dra', 'A.x17_deck', :pm_y, :pm_m), 'hod_signed', '... hod_signed');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'approve'), '22023', 'breaches_unreviewed', 'unreviewed breaches block approval');
SELECT tests.reset_role();
UPDATE public.work_rest_non_conformities SET review_outcome = 'accepted', review_note = 'Reviewed', reviewed_by = tests.user_id('A.master_dra')
WHERE submission_id = pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m) AND superseded_at IS NULL AND review_outcome IS NULL;
INSERT INTO public.work_rest_non_conformities (crew_id, submission_id, vessel_id, breach_day, rule_code, rule_description, severity, window_start, window_end, measured_value, threshold_value, status)
VALUES (tests.user_id('A.x17_deck'), pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m), tests.vessel_id('A.dra'), :'pm1'::date + 1, 'REST_PERIODS_MAX', 'Minor', 'low',
        (:'pm1'::date + 1)::timestamptz, (:'pm1'::date + 2)::timestamptz, 3, 2, 'open');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT pg_temp.keep('approve', pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'approve'));
SELECT tests.ok((SELECT r ->> 'status' = 'approved' AND r -> 'warnings' = '["low_breaches_unreviewed"]'::jsonb FROM rpc_out WHERE k = 'approve'),
  'approve with only a low breach unreviewed: approved, with a warning');
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'lock'), 'the master locks the month');
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'reopen'), '22023', 'reason_required', 'reopen needs a reason');
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'reopen', 'Correct the 6th'), 'the master reopens with a reason');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT signer_role, stale_at IS NOT NULL, stale_reason FROM public.work_rest_signatures WHERE submission_id = %L ORDER BY signed_at, signer_role$q$,
         pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m)),
  $q$VALUES ('crew', true, 'Correct the 6th'), ('hod', true, 'Correct the 6th'), ('captain', true, 'Correct the 6th')$q$,
  'reopen keeps every earlier signature, marked stale with the reason');
SELECT tests.ok((SELECT status = 'reopened' AND reopen_reason = 'Correct the 6th' AND reopened_by = tests.user_id('A.master_dra')
                        AND approved_at IS NULL AND locked_at IS NULL AND submitted_at IS NULL AND hod_signed_by IS NULL
                 FROM public.work_rest_monthly_submissions WHERE id = pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m)),
  'the reopened month clears the current chain''s stamps and records who and why');
SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_deck', :'pm1'::date + 2, pg_temp.w(8, 18)), 'a reopened month takes days again');
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'submit', NULL, 'Corrected and confirmed.'), 'the crew member signs again');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT signer_role, stale_at IS NULL, signature_payload ->> 'statement' FROM public.work_rest_signatures
            WHERE submission_id = %L AND signer_role = 'crew' ORDER BY signed_at, stale_at NULLS LAST$q$, pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m)),
  $q$VALUES ('crew', false, 'I confirm these records of my hours of work and rest are accurate.'), ('crew', true, 'Corrected and confirmed.')$q$,
  're-sign after reopen: a new live crew signature beside the stale one');
SELECT tests.is((SELECT count(*) FROM public.work_rest_audit_log WHERE submission_id = pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m) AND action LIKE 'month_%'),
                6::bigint, 'every month step writes an audit row (submit, HoD, approve, lock, reopen, submit)');

-- 6c. The HoD step (D-X1-11).
INSERT INTO public.vessel_work_rest_settings (vessel_id, hod_step) VALUES (tests.vessel_id('A.dra'), 'required');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'approve'), '22023', 'hod_signature_required',
  'hod_step required: approval waits for the head of department');
SELECT tests.reset_role();
UPDATE public.vessel_work_rest_settings SET hod_step = 'off' WHERE vessel_id = tests.vessel_id('A.dra');
SELECT tests.as_user(tests.user_id('A.x17_chief_officer'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'hod_sign'), '22023', 'hod_step_off', 'hod_step off: no HoD signature');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT pg_temp.keep('approve_off', pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'approve'));
SELECT tests.is((SELECT r -> 'warnings' FROM rpc_out WHERE k = 'approve_off'), '[]'::jsonb, 'hod_step off: approved without the nudge (the low breach went with its correction)');
SELECT tests.reset_role();
UPDATE public.vessel_work_rest_settings SET hod_step = 'nudge' WHERE vessel_id = tests.vessel_id('A.dra');

-- 6d. On behalf of a leaver (C43).
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_stew', :p2_y, :p2_m, 'submit_on_behalf', 'Left'), '22023', 'still_on_vessel',
  'on behalf only for someone who has left the vessel');
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_gone', :pm_y, :pm_m, 'submit_on_behalf'), '22023', 'reason_required', 'on behalf needs a reason');
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x17_gone', :pm_y, :pm_m, 'submit_on_behalf', 'Signed off on the 26th before submitting.'), 'the master submits for the leaver');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT s.status, s.submitted_on_behalf_by = %L, s.on_behalf_reason, s.crew_signed_at IS NULL, g.signer_role, g.signature_payload ->> 'reason'
            FROM public.work_rest_monthly_submissions AS s JOIN public.work_rest_signatures AS g ON g.submission_id = s.id AND g.stale_at IS NULL WHERE s.id = %L$q$,
         tests.user_id('A.master_dra'), pg_temp.month_id('A.dra', 'A.x17_gone', :pm_y, :pm_m)),
  $q$VALUES ('submitted', true, 'Signed off on the 26th before submitting.', true, 'company', 'Signed off on the 26th before submitting.')$q$,
  'on behalf records who and why, with the company signature');
SELECT tests.as_user(tests.user_id('A.x17_chief_officer'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_gone', :p3_y, :p3_m, 'submit_on_behalf', 'Left'), '42501', 'not_permitted', 'on behalf needs final approve');

-- 6e. One's own month; the future.
SELECT tests.reset_role();
SELECT tests.seed_rbac_role('A.master_dra', 'x17_crew', 'A.dra');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.lives(pg_temp.tr('A.dra', 'A.master_dra', :pm_y, :pm_m, 'submit'), 'the master submits their own month');
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.master_dra', :pm_y, :pm_m, 'approve'), '42501', 'own_month', 'nobody approves their own month');
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', extract(year FROM current_date + 40)::integer, extract(month FROM current_date + 40)::integer, 'submit'),
  '22023', 'month_in_future', 'a month that has not started is refused');
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'archive'), '22023', 'action_unknown', 'an unknown step is refused');
SELECT tests.as_user(tests.user_id('A.x17_viewer'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_viewer', :pm_y, :pm_m, 'submit'), '42501', 'not_permitted', 'no hours-of-rest rights: refused');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(pg_temp.tr('A.dra', 'A.x17_deck', :pm_y, :pm_m, 'approve'), '42501', 'not_permitted', 'another tenant is refused');

-- ------------------------------------------------------------ 7. two vessels in one month (D-X1-20)

SELECT tests.reset_role();
-- HYDRA days of the transferred crew member before the move (written as maintenance: they left HYDRA).
INSERT INTO public.work_rest_records (crew_id, vessel_id, record_date)
SELECT tests.user_id('A.x17_transfer'), tests.vessel_id('A.hyd'), :'pm1'::date + d FROM generate_series(9, 14) AS d;
INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, start_minute, end_minute)
SELECT r.id, r.crew_id, 'work', 0, 1080 FROM public.work_rest_records AS r
WHERE r.crew_id = tests.user_id('A.x17_transfer') AND r.vessel_id = tests.vessel_id('A.hyd') AND r.record_date BETWEEN :'pm1'::date + 9 AND :'pm1'::date + 14;
DELETE FROM public.work_rest_records WHERE crew_id = tests.user_id('A.x17_transfer') AND record_date = :'pm1'::date + 15;
INSERT INTO public.work_rest_records (crew_id, vessel_id, record_date) VALUES (tests.user_id('A.x17_transfer'), tests.vessel_id('A.dra'), :'pm1'::date + 15);
INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, start_minute, end_minute)
SELECT r.id, r.crew_id, 'work', 0, 1080 FROM public.work_rest_records AS r WHERE r.crew_id = tests.user_id('A.x17_transfer') AND r.record_date = :'pm1'::date + 15;
SELECT tests.as_user(tests.user_id('A.x17_transfer'));
SELECT tests.lives(pg_temp.save('A.dra', 'A.x17_transfer', :'pm1'::date + 16, pg_temp.w(0, 18)), 'the first DRAAK week closes a 7-day window over both vessels');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT s.vessel_id = %L FROM public.work_rest_monthly_submissions AS s
            WHERE s.crew_id = %L AND s.period_year = %s AND s.period_month = %s ORDER BY 1$q$,
         tests.vessel_id('A.dra'), tests.user_id('A.x17_transfer'), :pm_y, :pm_m),
  $q$VALUES (false), (true)$q$,
  'one month per vessel for the same person and month');
SELECT tests.results_eq(
  format($q$SELECT n.vessel_id = %L, n.measured_value, (n.window_start AT TIME ZONE 'UTC')::date FROM public.work_rest_non_conformities AS n
            WHERE n.crew_id = %L AND n.breach_day = %L AND n.rule_code = 'REST_7D_MIN' AND n.superseded_at IS NULL$q$,
         tests.vessel_id('A.dra'), tests.user_id('A.x17_transfer'), :'pm1'::date + 16, :'pm1'::date + 16),
  format($q$VALUES (true, 42.00, %L::date)$q$, :'pm1'::date + 10),
  'the 7-day breach of a DRAAK day counts the HYDRA days before it, on the DRAAK month');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.work_rest_non_conformities WHERE crew_id = tests.user_id('A.x17_transfer') AND vessel_id = tests.vessel_id('A.hyd')
                        AND submission_id = pg_temp.month_id('A.hyd', 'A.x17_transfer', :pm_y, :pm_m)),
  'the HYDRA days keep their breaches on the HYDRA month');
SELECT tests.as_user(tests.user_id('A.x17_transfer'));
SELECT tests.lives(pg_temp.tr('A.dra', 'A.x17_transfer', :pm_y, :pm_m, 'submit'), 'the person submits their DRAAK month');
SELECT tests.throws_like(pg_temp.tr('A.hyd', 'A.x17_transfer', :pm_y, :pm_m, 'submit'), '42501', 'not_permitted', '... not the HYDRA one, a vessel they have left');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(pg_temp.tr('A.hyd', 'A.x17_transfer', :pm_y, :pm_m, 'submit_on_behalf', 'Transferred to DRAAK on the 16th.'),
  'the fleet manager submits the HYDRA month on their behalf');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT v.name, s.status FROM public.work_rest_monthly_submissions AS s JOIN public.vessels AS v ON v.id = s.vessel_id
            WHERE s.crew_id = %L AND s.period_year = %s AND s.period_month = %s ORDER BY v.name$q$, tests.user_id('A.x17_transfer'), :pm_y, :pm_m),
  $q$VALUES ('HYDRA', 'submitted'), ('M/Y DRAAK', 'submitted')$q$,
  'each vessel''s month is signed on its own vessel');

-- ------------------------------------------------------------ 8. write guards

SELECT tests.as_user(tests.user_id('A.x17_deck'));
SELECT tests.throws_like(format($q$INSERT INTO public.work_rest_records (crew_id, vessel_id, record_date) VALUES (%L, %L, %L)$q$,
  tests.user_id('A.x17_deck'), tests.vessel_id('A.dra'), :'pm1'::date + 26), '42501', 'work_rest_engine_only', 'a direct record insert is refused');
SELECT tests.throws_like(format($q$UPDATE public.work_rest_records SET notes = 'x' WHERE crew_id = %L$q$, tests.user_id('A.x17_deck')), '42501', 'work_rest_engine_only',
  'a direct record update is refused');
SELECT tests.throws_like(format($q$DELETE FROM public.work_rest_records WHERE crew_id = %L$q$, tests.user_id('A.x17_deck')), '42501', 'work_rest_engine_only',
  'a direct record delete is refused');
SELECT tests.throws_like(format($q$INSERT INTO public.work_rest_blocks (record_id, crew_id, start_minute, end_minute)
                                  SELECT id, crew_id, 0, 60 FROM public.work_rest_records WHERE crew_id = %L LIMIT 1$q$, tests.user_id('A.x17_deck')),
  '42501', 'work_rest_engine_only', 'a direct block insert is refused');
SELECT tests.throws_like(format($q$DELETE FROM public.work_rest_blocks WHERE crew_id = %L$q$, tests.user_id('A.x17_deck')), '42501', 'work_rest_engine_only',
  'a direct block delete is refused');
SELECT tests.throws_like(format($q$DELETE FROM public.work_rest_non_conformities WHERE crew_id = %L$q$, tests.user_id('A.x17_deck')), '42501', 'work_rest_engine_only',
  'a crew member cannot delete their own breaches ("Manage NCs" is closed)');
SELECT tests.throws_like(format($q$UPDATE public.work_rest_non_conformities SET status = 'dismissed' WHERE crew_id = %L$q$, tests.user_id('A.x17_deck')), '42501', 'work_rest_engine_only',
  '... nor dismiss them');
SELECT tests.throws_like(format($q$INSERT INTO public.work_rest_non_conformities (crew_id, rule_code, rule_description, window_start, window_end) VALUES (%L, 'X', 'x', now(), now())$q$,
  tests.user_id('A.x17_deck')), '42501', 'work_rest_engine_only', '... nor insert one');
SELECT tests.throws_like(format($q$INSERT INTO public.work_rest_signatures (submission_id, signer_id, signer_role) VALUES (%L, %L, 'crew')$q$,
  pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m), tests.user_id('A.x17_deck')), '42501', 'work_rest_engine_only', 'a direct signature is refused');
SELECT tests.throws_like(format($q$INSERT INTO public.work_rest_compliance_checks (crew_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes)
                                  VALUES (%L, 'daily', now(), now(), 600, 840, true)$q$, tests.user_id('A.x17_deck')),
  '42501', 'work_rest_engine_only', 'a direct compliance check is refused');
SELECT tests.throws_like(format($q$INSERT INTO public.work_rest_audit_log (crew_id, actor_id, action) VALUES (%L, %L, 'forged')$q$,
  tests.user_id('A.x17_deck'), tests.user_id('A.x17_deck')), '42501', 'work_rest_engine_only', 'a forged audit row is refused');
SELECT tests.throws_like(format($q$UPDATE public.work_rest_monthly_submissions SET status = 'draft' WHERE id = %L$q$,
  pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m)), '42501', 'work_rest_engine_only', 'a crew member cannot move their approved month back to draft');
SELECT tests.throws_like(format($q$UPDATE public.work_rest_monthly_submissions SET is_compliant = true WHERE id = %L$q$,
  pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m)), '42501', 'work_rest_engine_only', '... nor change its totals');
SELECT tests.throws_like(format($q$INSERT INTO public.work_rest_monthly_submissions (crew_id, vessel_id, period_year, period_month, status) VALUES (%L, %L, %s, %s, 'submitted')$q$,
  tests.user_id('A.x17_deck'), tests.vessel_id('A.dra'), :p3_y, :p3_m), '42501', 'work_rest_engine_only', 'a month cannot be created submitted');
SELECT tests.lives(format($q$INSERT INTO public.work_rest_monthly_submissions (crew_id, vessel_id, period_year, period_month, status) VALUES (%L, %L, %s, %s, 'draft')$q$,
  tests.user_id('A.x17_deck'), tests.vessel_id('A.dra'), :p3_y, :p3_m), 'a blank draft month may be created (the legacy month view)');
SELECT tests.throws_like(format($q$UPDATE public.work_rest_monthly_submissions SET status = 'approved' WHERE crew_id = %L AND period_year = %s AND period_month = %s$q$,
  tests.user_id('A.x17_deck'), :p3_y, :p3_m), '42501', 'work_rest_engine_only', '... but not approved directly');
SELECT tests.throws_like(format($q$UPDATE public.work_rest_monthly_submissions SET reopen_reason = 'x' WHERE crew_id = %L AND period_year = %s AND period_month = %s$q$,
  tests.user_id('A.x17_deck'), :p3_y, :p3_m), '42501', 'work_rest_engine_only', '... nor given stamps');
SELECT tests.reset_role();
SELECT tests.seed_user_role('A.fleet_manager', 'dpa', 'A');
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.throws_like(format($q$UPDATE public.work_rest_monthly_submissions SET status = 'locked' WHERE id = %L$q$,
  pg_temp.month_id('A.dra', 'A.x17_deck', :pm_y, :pm_m)), '42501', 'work_rest_engine_only', 'a fleet manager (whom the legacy policy lets update) cannot lock a month directly either');
SELECT tests.as_service();
SELECT tests.lives(format($q$UPDATE public.work_rest_records SET notes = 'maintenance' WHERE crew_id = %L$q$, tests.user_id('A.x17_deck')),
  'the service role may write records directly');
SELECT tests.lives(format($q$UPDATE public.work_rest_monthly_submissions SET status = 'draft' WHERE id = %L$q$, pg_temp.month_id('A.dra', 'A.x17_deck', :p3_y, :p3_m)),
  '... and months');
SELECT tests.reset_role();
SELECT tests.lives(format($q$DELETE FROM public.work_rest_compliance_checks WHERE crew_id = %L$q$, tests.user_id('A.x17_deck')),
  'maintenance without a JWT may write directly');

-- ------------------------------------------------------------ 9. grants

SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'),
  'browser RPC: ' || f)
FROM unnest(ARRAY['public.work_rest_save_day(uuid, uuid, date, jsonb, text)', 'public.work_rest_fill_days(uuid, uuid, date, date[])',
                  'public.work_rest_month_transition(uuid, uuid, integer, integer, text, text, text)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE')
                AND has_function_privilege('service_role', f, 'EXECUTE'),
  'internal: ' || f)
FROM unnest(ARRAY['public.work_rest_rule_eval(jsonb, jsonb, date, date)', 'public.work_rest_rule_text(text, jsonb)', 'public.work_rest_month_decide(text, text, jsonb)',
                  'public.work_rest_vessel_tz(uuid)', 'public.work_rest_rules_for(uuid)', 'public.work_rest_hor_on(uuid, date)',
                  'public.work_rest_assignment_on(uuid, uuid, date, date)', 'public.work_rest_department_on(uuid, uuid, date, date)',
                  'public.work_rest_day_gate(uuid, uuid, date)', 'public.work_rest_month_row(uuid, uuid, integer, integer)',
                  'public.work_rest_month_refresh(uuid)', 'public.work_rest_recompute(uuid, date, date)',
                  'public.work_rest_day_write(uuid, uuid, date, jsonb, text, boolean)']) AS f;
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND NOT has_function_privilege('service_role', f, 'EXECUTE'),
  'trigger function: ' || f)
FROM unnest(ARRAY['public.work_rest_submissions_status_guard()', 'public.work_rest_engine_write_guard()']) AS f;
SELECT tests.results_eq(
  $q$SELECT tgname::text FROM pg_trigger WHERE tgname LIKE 'work_rest_%guard' ORDER BY 1$q$,
  $q$VALUES ('work_rest_audit_log_write_guard'), ('work_rest_blocks_write_guard'), ('work_rest_compliance_checks_write_guard'),
            ('work_rest_non_conformities_write_guard'), ('work_rest_records_write_guard'), ('work_rest_signatures_write_guard'),
            ('work_rest_submissions_status_guard')$q$,
  'the seven guards are in place');
