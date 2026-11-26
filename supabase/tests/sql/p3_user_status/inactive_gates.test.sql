-- Inactive callers get FALSE from every legacy capability helper and
-- nothing from the legacy definers (D-233, D-122, D-04; review round 6,
-- inactive-helpers-null-fail-open). legacy_profile_role(), my_profile_id()
-- and get_user_company_id() answer NULL for an inactive user, and the
-- legacy OR-chains (has_any_role OR rbac_company_permission OR
-- legacy_profile_role IN ...) answered NULL, or TRUE through an RBAC role
-- or a practitioner row that reads no status. A plpgsql definer gating with
-- "IF NOT helper(auth.uid()) THEN RAISE" skips the RAISE on NULL: a
-- disabled crew member of A applied B's pay review, wrote B's
-- self-assessment and acknowledged B's disciplinary record. Here:
--   - every inactive persona (profile disabled, a disabled legacy dpa, a
--     disabled RBAC holder of hr / finance / legal / medical / wellness
--     admin and the planner flags, membership disabled, auth ban, a JWT
--     with no profile) gets IS FALSE from each redefined helper;
--   - each definer, run on company B's rows (and A's own), raises, and B's
--     rows are unchanged afterwards;
--   - an ACTIVE payroll admin of A is refused on B's ids and succeeds on
--     A's own (control);
--   - the storage predicate, the payroll-run approval trigger and the
--     privileged-profile-columns trigger refuse the inactive RBAC admin;
--   - an inventory over every browser-executable plpgsql SECURITY DEFINER
--     function: every "IF NOT <helper>(" callee that returns boolean and
--     takes a uuid first is probed as each inactive persona (IS FALSE) or
--     allow-listed with a reason, and no definer compares with
--     "<> my_profile_id() / get_user_company_id() /
--     current_user_company_id()" unless allow-listed.
-- Adapted from scratchpad verify-null-gates/v1_null_gates.sql and v2_legal.sql.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');

-- ------------------------------------------------------------ personas

-- Every inactive persona but A.disabled (the plain disabled crew member of
-- the finding) holds every privilege source a helper reads: a legacy dpa
-- profile role (where the persona has a profile), a user_roles dpa row of
-- A, the RBAC dpa role (hr, finance, legal, medical, wellness admin) and a
-- planner role with the crew.* flags; A.rbac_off is also an active medical
-- practitioner. Active, any of them would pass every gate below.
SELECT tests.seed_user('A', 'A.dpa_off', 'dpa', 'disabled');
SELECT tests.seed_user('A', 'A.rbac_off', 'crew', 'disabled');
SELECT tests.seed_user('A', 'A.memb_off', 'dpa');
SELECT tests.seed_user('A', 'A.banned', 'dpa');
SELECT tests.seed_auth_user('X.no_profile');
UPDATE public.account_memberships SET status = 'disabled', disabled_at = now() WHERE user_id = tests.user_id('A.memb_off');
UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = tests.user_id('A.banned');
-- An active control holding the same RBAC roles (no legacy dpa role).
SELECT tests.seed_user('A', 'A.rbac_on', 'crew');

SELECT tests.seed_role('r6_planner', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, k, 'edit', 'fleet' FROM public.roles AS r,
       unnest(ARRAY['crew.edit_crew_profiles', 'crew.approve_leave', 'crew.view_crew_profiles', 'crew.see_crew_list', 'crew.access_leave_records']) AS k
WHERE r.name = 'r6_planner';
SELECT tests.seed_user_role(k, 'dpa', 'A'), tests.seed_rbac_role(k, 'dpa'), tests.seed_rbac_role(k, 'r6_planner')
FROM unnest(ARRAY['A.dpa_off', 'A.rbac_off', 'A.memb_off', 'A.banned', 'X.no_profile', 'A.rbac_on']) AS k;
INSERT INTO public.hw_practitioners (id, company_id, profile_id, discipline, full_name)
VALUES (tests.id('hwp:A.rbac_off'), tests.company_id('A'), tests.profile_id('A.rbac_off'), 'medical', 'Ship doctor');

CREATE TEMP TABLE persona (k text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO persona VALUES ('A.disabled'), ('A.dpa_off'), ('A.rbac_off'), ('A.memb_off'), ('A.banned'), ('X.no_profile');
GRANT SELECT ON persona TO authenticated;

SELECT tests.ok(NOT public.user_is_active(tests.user_id(k)), 'setup: ' || k || ' is not active') FROM persona ORDER BY k;
SELECT tests.ok(public.user_is_active(tests.user_id('A.rbac_on')) AND public.user_is_active(tests.user_id('A.fleet_manager')), 'setup: the controls are active');
SELECT tests.is((SELECT count(*) FROM public.profiles WHERE user_id = tests.user_id('X.no_profile')), 0::bigint, 'setup: X.no_profile has a login and no profile');

-- ------------------------------------------------------------ rows (as the superuser)

-- Company B: the victim rows.
INSERT INTO public.crew_compensation (id, company_id, profile_id, base_salary_minor, effective_from, status, gratuity_eligible)
VALUES (tests.id('cc:B.crew'), tests.company_id('B'), tests.profile_id('B.crew'), 300000, current_date - 100, 'active', true);
INSERT INTO public.pay_reviews (id, company_id, profile_id, effective_date, previous_base_minor, proposed_base_minor, status, reason)
VALUES (tests.id('pr:B'), tests.company_id('B'), tests.profile_id('B.crew'), current_date, 300000, 390000, 'approved', 'annual');
INSERT INTO public.performance_reviews (id, company_id, profile_id, status) VALUES
  (tests.id('perf:B.self'), tests.company_id('B'), tests.profile_id('B.crew'), 'self_assessment'),
  (tests.id('perf:B.ack'), tests.company_id('B'), tests.profile_id('B.crew'), 'awaiting_acknowledgement');
INSERT INTO public.disciplinary_records (id, company_id, profile_id, description)
VALUES (tests.id('disc:B'), tests.company_id('B'), tests.profile_id('B.crew'), 'B record');
INSERT INTO public.pay_periods (id, company_id, label, start_date, end_date)
VALUES (tests.id('pp:B'), tests.company_id('B'), 'B month', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
INSERT INTO public.payroll_runs (id, company_id, pay_period_id, run_number, status)
VALUES (tests.id('run:B'), tests.company_id('B'), tests.id('pp:B'), 'B-RUN-1', 'draft');
INSERT INTO public.gratuity_pools (id, company_id, vessel_id, name, period_start, period_end, gross_amount_minor, status)
VALUES (tests.id('pool:B'), tests.company_id('B'), tests.vessel_id('B.lev'), 'B pool', current_date - 30, current_date - 1, 100000, 'draft');
INSERT INTO public.legal_requests (id, company_id, submitted_by, request_type, title, sla_deadline)
VALUES (tests.id('lr:B'), tests.company_id('B'), tests.user_id('B.admin'), 'nda', 'B NDA', now() - interval '3 hours');
INSERT INTO public.vacancies (id, company_id, title, vessel_id) VALUES (tests.id('vac:B'), tests.company_id('B'), 'Deckhand', tests.vessel_id('B.lev'));
INSERT INTO public.candidates (id, company_id, first_name, last_name) VALUES (tests.id('cand:B'), tests.company_id('B'), 'Candidate', 'B');
INSERT INTO public.candidate_applications (id, company_id, vacancy_id, candidate_id, stage)
VALUES (tests.id('app:B'), tests.company_id('B'), tests.id('vac:B'), tests.id('cand:B'), 'accepted');

-- Company A: the control rows (and the inactive personas' own company).
INSERT INTO public.crew_compensation (id, company_id, profile_id, base_salary_minor, effective_from, status, gratuity_eligible)
VALUES (tests.id('cc:A.crew_hyd'), tests.company_id('A'), tests.profile_id('A.crew_hyd'), 200000, current_date - 100, 'active', true);
INSERT INTO public.pay_reviews (id, company_id, profile_id, effective_date, previous_base_minor, proposed_base_minor, status, reason)
VALUES (tests.id('pr:A'), tests.company_id('A'), tests.profile_id('A.crew_hyd'), current_date, 200000, 210000, 'approved', 'annual');
INSERT INTO public.pay_periods (id, company_id, label, start_date, end_date)
VALUES (tests.id('pp:A'), tests.company_id('A'), 'A month', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
INSERT INTO public.payroll_runs (id, company_id, pay_period_id, run_number, status)
VALUES (tests.id('run:A'), tests.company_id('A'), tests.id('pp:A'), 'A-RUN-1', 'draft'),
       (tests.id('run:A2'), tests.company_id('A'), tests.id('pp:A'), 'A-RUN-2', 'calculated');
INSERT INTO public.gratuity_pools (id, company_id, vessel_id, name, period_start, period_end, gross_amount_minor, status)
VALUES (tests.id('pool:A'), tests.company_id('A'), tests.vessel_id('A.hyd'), 'A pool', current_date - 30, current_date - 1, 100000, 'draft');
INSERT INTO public.legal_requests (id, company_id, submitted_by, request_type, title, sla_deadline)
VALUES (tests.id('lr:A'), tests.company_id('A'), tests.user_id('A.fleet_manager'), 'nda', 'A NDA', now() - interval '3 hours');

CREATE TEMP TABLE b_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.crew_compensation WHERE company_id = tests.company_id('B')) AS comp_rows,
       (SELECT count(*) FROM public.alerts WHERE company_id = tests.company_id('B')) AS alerts,
       (SELECT count(*) FROM public.profiles WHERE company_id = tests.company_id('B')) AS profiles,
       (SELECT count(*) FROM public.onboarding_records WHERE company_id = tests.company_id('B')) AS onboarding;
GRANT SELECT ON b_before TO authenticated;

-- ------------------------------------------------------------ helper probes: IS FALSE for every inactive persona

CREATE TEMP TABLE helper_probe (expr text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO helper_probe VALUES
  ('public.hr_can_admin(auth.uid())'), ('public.hr_can_edit(auth.uid())'), ('public.hr_can_view(auth.uid())'),
  ('public.payroll_can_admin(auth.uid())'), ('public.payroll_can_edit(auth.uid())'), ('public.payroll_can_view(auth.uid())'),
  ('public.legal_can_admin(auth.uid())'), ('public.legal_can_edit(auth.uid())'), ('public.legal_can_view(auth.uid())'),
  ('public.medical_can_admin(auth.uid())'), ('public.medical_can_edit(auth.uid())'), ('public.medical_can_view(auth.uid())'),
  ('public.wellness_can_admin(auth.uid())'), ('public.wellness_can_edit(auth.uid())'), ('public.wellness_can_view(auth.uid())'),
  ('public.med_fitness_can_view(auth.uid())'),
  ('public.hw_is_practitioner(auth.uid(), NULL)'), ('public.hw_is_practitioner(auth.uid(), ''medical'')'),
  ('public.hr_can_write_crew_record(auth.uid())'),
  ('public.frp_can_edit(auth.uid())'), ('public.frp_can_view(auth.uid())');
GRANT SELECT ON helper_probe TO authenticated;

DO $$
DECLARE p text; h text; v boolean;
BEGIN
  FOR p IN SELECT k FROM persona ORDER BY k LOOP
    PERFORM tests.as_user(tests.user_id(p));
    FOR h IN SELECT expr FROM helper_probe ORDER BY expr LOOP
      EXECUTE 'SELECT ' || h INTO v;
      PERFORM tests.is(v, false, format('%s: %s IS FALSE', p, h));
    END LOOP;
    EXECUTE format('SELECT public.hr_can_write_crew_record(%L)', tests.user_id('A.crew_hyd')) INTO v;
    PERFORM tests.is(v, false, p || ': hr_can_write_crew_record(another crew member) IS FALSE');
  END LOOP;
END
$$;
SELECT tests.reset_role();

-- Asked by an active member about an inactive colleague: false too.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.hr_can_admin(tests.user_id('A.dpa_off')), false, 'asked about a disabled dpa colleague: hr_can_admin IS FALSE');
SELECT tests.is(public.payroll_can_admin(tests.user_id('A.rbac_off')), false, 'asked about a disabled RBAC admin colleague: payroll_can_admin IS FALSE');
SELECT tests.is(public.hw_is_practitioner(tests.user_id('A.rbac_off'), 'medical'), false, 'asked about a disabled practitioner: hw_is_practitioner IS FALSE');
SELECT tests.is(public.hr_can_admin(NULL), false, 'hr_can_admin(NULL) IS FALSE');
SELECT tests.is(public.hr_can_admin(tests.id('nobody')), false, 'hr_can_admin(unknown id) IS FALSE');
SELECT tests.reset_role();

-- Controls: the active holders still pass (the bodies are unchanged).
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok(public.hr_can_admin(auth.uid()) AND public.payroll_can_admin(auth.uid()) AND public.legal_can_admin(auth.uid())
                AND public.medical_can_admin(auth.uid()) AND public.wellness_can_admin(auth.uid()) AND public.med_fitness_can_view(auth.uid()),
                'control: the active legacy dpa passes the admin helpers');
SELECT tests.ok(public.hr_can_write_crew_record(tests.user_id('A.crew_hyd')), 'control: an active HR editor writes a colleague''s crew record');
SELECT tests.as_user(tests.user_id('A.rbac_on'));
SELECT tests.ok(public.hr_can_admin(auth.uid()) AND public.payroll_can_admin(auth.uid()) AND public.legal_can_admin(auth.uid()) AND public.wellness_can_admin(auth.uid()),
                'control: the active RBAC dpa holder passes through rbac_company_permission');
SELECT tests.ok(public.frp_can_edit(auth.uid()) AND public.frp_can_view(auth.uid()), 'control: the active planner-flag holder passes frp_can_edit / frp_can_view');
SELECT tests.ok(public.hr_can_write_crew_record(auth.uid()), 'control: an active crew member writes their own crew record');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is(public.hr_can_admin(auth.uid()), false, 'control: an active crew member is no HR admin (false, not NULL)');
SELECT tests.is(public.payroll_can_admin(auth.uid()), false, 'control: nor a payroll admin (false, not NULL)');
SELECT tests.reset_role();

-- ------------------------------------------------------------ definer probes: every inactive persona is refused

CREATE TEMP TABLE definer_probe (label text PRIMARY KEY, stmt text) ON COMMIT DROP;
INSERT INTO definer_probe VALUES
  ('pay_review_apply on B', format('SELECT public.pay_review_apply(%L)', tests.id('pr:B'))),
  ('pay_review_apply on A', format('SELECT public.pay_review_apply(%L)', tests.id('pr:A'))),
  ('payroll_calculate_run on B', format('SELECT public.payroll_calculate_run(%L)', tests.id('run:B'))),
  ('payroll_calculate_run on A', format('SELECT public.payroll_calculate_run(%L)', tests.id('run:A'))),
  ('gratuity_calculate_pool on B', format('SELECT public.gratuity_calculate_pool(%L)', tests.id('pool:B'))),
  ('gratuity_calculate_pool on A', format('SELECT public.gratuity_calculate_pool(%L)', tests.id('pool:A'))),
  ('performance_review_submit_self_assessment on B', format($q$SELECT public.performance_review_submit_self_assessment(%L, '[{"x": 1}]'::jsonb, 'written by an inactive caller')$q$, tests.id('perf:B.self'))),
  ('performance_review_acknowledge on B', format($q$SELECT public.performance_review_acknowledge(%L, 'acknowledged by an inactive caller')$q$, tests.id('perf:B.ack'))),
  ('disciplinary_record_acknowledge on B', format('SELECT public.disciplinary_record_acknowledge(%L)', tests.id('disc:B'))),
  ('legal_generate_alerts()', 'SELECT public.legal_generate_alerts()'),
  ('legal_generate_alerts(B)', format('SELECT public.legal_generate_alerts(%L)', tests.company_id('B'))),
  ('recruitment_hire_candidate on B', format('SELECT public.recruitment_hire_candidate(%L, current_date)', tests.id('app:B'))),
  ('onboarding_start on B', format('SELECT public.onboarding_start(%L, %L, current_date)', tests.profile_id('B.crew'), tests.vessel_id('B.lev')));
GRANT SELECT ON definer_probe TO authenticated;

DO $$
DECLARE p text; d record;
BEGIN
  FOR p IN SELECT k FROM persona ORDER BY k LOOP
    PERFORM tests.as_user(tests.user_id(p));
    FOR d IN SELECT * FROM definer_probe ORDER BY label LOOP
      PERFORM tests.throws(d.stmt, NULL, format('%s: %s raises', p, d.label));
    END LOOP;
  END LOOP;
END
$$;
SELECT tests.reset_role();

-- Cross-tenant: an ACTIVE payroll and legal admin of A (A.fleet_manager)
-- is refused on every one of B's ids.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
DO $$
DECLARE d record;
BEGIN
  FOR d IN SELECT * FROM definer_probe WHERE label LIKE '% on B' ORDER BY label LOOP
    PERFORM tests.throws(d.stmt, NULL, format('active A admin: %s raises', d.label));
  END LOOP;
END
$$;
SELECT tests.throws_like(format('SELECT public.pay_review_apply(%L)', tests.id('pr:B')), NULL, 'Pay review not found', 'active A admin: B''s pay review reads as not found');
SELECT tests.throws_like(format('SELECT public.payroll_calculate_run(%L)', tests.id('run:B')), NULL, 'Payroll run not found', 'active A admin: B''s payroll run reads as not found');
SELECT tests.throws_like(format('SELECT public.gratuity_calculate_pool(%L)', tests.id('pool:B')), NULL, 'Gratuity pool not found', 'active A admin: B''s gratuity pool reads as not found');
-- Control: the same calls on A's own rows succeed.
SELECT tests.lives(format('SELECT public.pay_review_apply(%L)', tests.id('pr:A')), 'control: the active A admin applies A''s pay review');
SELECT tests.lives(format('SELECT public.payroll_calculate_run(%L)', tests.id('run:A')), 'control: and calculates A''s payroll run');
SELECT tests.lives(format('SELECT public.gratuity_calculate_pool(%L)', tests.id('pool:A')), 'control: and splits A''s gratuity pool');
SELECT tests.is(public.legal_generate_alerts(), 1, 'control: legal_generate_alerts() raises A''s one SLA alert');
SELECT tests.is(public.legal_generate_alerts(tests.company_id('B')), 0, 'and a company argument never widens a signed-in caller beyond their own company');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.pay_reviews WHERE id = tests.id('pr:A')), 'applied', 'control: A''s pay review is applied');
SELECT tests.is((SELECT status FROM public.payroll_runs WHERE id = tests.id('run:A')), 'calculated', 'control: A''s run is calculated');
SELECT tests.is((SELECT status FROM public.gratuity_pools WHERE id = tests.id('pool:A')), 'calculated', 'control: A''s pool is calculated');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.alerts WHERE company_id = tests.company_id('A') AND related_entity_id = tests.id('lr:A')), 'control: the A alert exists');

-- B's rows are unchanged.
SELECT tests.is((SELECT count(*) FROM public.crew_compensation WHERE company_id = tests.company_id('B')), (SELECT comp_rows FROM b_before), 'B''s compensation: no row added');
SELECT tests.results_eq(
  format($q$SELECT id, base_salary_minor FROM public.crew_compensation WHERE profile_id = %L AND status = 'active'$q$, tests.profile_id('B.crew')),
  format($q$VALUES (%L::uuid, 300000::bigint)$q$, tests.id('cc:B.crew')),
  'B''s compensation: the same active row');
SELECT tests.is((SELECT status FROM public.pay_reviews WHERE id = tests.id('pr:B')), 'approved', 'B''s pay review is still approved');
SELECT tests.results_eq(
  format($q$SELECT id, status, employee_comments, self_assessment_submitted_at IS NULL, employee_acknowledged_at IS NULL FROM public.performance_reviews WHERE company_id = %L$q$, tests.company_id('B')),
  format($q$VALUES (%L::uuid, 'self_assessment'::text, NULL::text, true, true), (%L::uuid, 'awaiting_acknowledgement'::text, NULL::text, true, true)$q$, tests.id('perf:B.self'), tests.id('perf:B.ack')),
  'B''s reviews: same status, no comments, no submission or acknowledgement');
SELECT tests.is((SELECT acknowledged_by_crew_at FROM public.disciplinary_records WHERE id = tests.id('disc:B')), NULL::timestamptz, 'B''s disciplinary record: acknowledged_by_crew_at still NULL');
SELECT tests.is((SELECT status FROM public.payroll_runs WHERE id = tests.id('run:B')), 'draft', 'B''s payroll run is still draft');
SELECT tests.is((SELECT count(*) FROM public.payroll_lines WHERE run_id = tests.id('run:B')), 0::bigint, 'B''s payroll run has no lines');
SELECT tests.is((SELECT status FROM public.gratuity_pools WHERE id = tests.id('pool:B')), 'draft', 'B''s gratuity pool is still draft');
SELECT tests.is((SELECT count(*) FROM public.gratuity_distributions WHERE pool_id = tests.id('pool:B')), 0::bigint, 'B''s pool has no distributions');
SELECT tests.is((SELECT count(*) FROM public.alerts WHERE company_id = tests.company_id('B')), (SELECT alerts FROM b_before), 'B''s alerts: count unchanged');
SELECT tests.is((SELECT count(*) FROM public.profiles WHERE company_id = tests.company_id('B')), (SELECT profiles FROM b_before), 'B''s profiles: no hire');
SELECT tests.is((SELECT status FROM public.candidates WHERE id = tests.id('cand:B')) IS DISTINCT FROM 'hired', true, 'B''s candidate is not hired');
SELECT tests.is((SELECT count(*) FROM public.onboarding_records WHERE company_id = tests.company_id('B')), (SELECT onboarding FROM b_before), 'B''s onboarding: no record started');

-- ------------------------------------------------------------ storage predicate and the legacy triggers

DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT k FROM persona ORDER BY k LOOP
    PERFORM tests.as_user(tests.user_id(p));
    PERFORM tests.is(public.legal_attachment_path_allowed(tests.company_id('A') || '/requests/' || tests.id('lr:A') || '/file.pdf'), false,
                     p || ': legal_attachment_path_allowed is false on its own company''s path');
  END LOOP;
END
$$;
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is(public.legal_attachment_path_allowed(tests.company_id('A') || '/requests/' || tests.id('lr:A') || '/file.pdf'), true, 'control: an active legal admin may use A''s path');
SELECT tests.is(public.legal_attachment_path_allowed(tests.company_id('B') || '/requests/' || tests.id('lr:B') || '/file.pdf'), false, 'but never B''s');
SELECT tests.is(public.legal_attachment_path_allowed('file.pdf'), false, 'and a path without folders is false');
SELECT tests.reset_role();

-- As the persona the rows are not even visible (RLS); as the superuser with
-- the persona's JWT the legacy triggers decide, and refuse.
SELECT tests.as_user(tests.user_id('A.rbac_off'));
SELECT tests.denied(format($q$UPDATE public.payroll_runs SET status = 'approved' WHERE id = %L RETURNING id$q$, tests.id('run:A2')), 'the inactive RBAC admin cannot approve a payroll run');
SELECT tests.denied(format($q$UPDATE public.profiles SET role = 'master' WHERE user_id = %L RETURNING id$q$, tests.user_id('A.crew_hyd')), 'nor change a profile role');
RESET ROLE;
SELECT tests.throws_like(format($q$UPDATE public.payroll_runs SET status = 'approved' WHERE id = %L$q$, tests.id('run:A2')), NULL, 'Only payroll admins can approve or pay a payroll run',
                         'payroll_runs_guard_transitions refuses an approval by the inactive RBAC finance admin');
SELECT tests.throws_like(format($q$UPDATE public.payroll_runs SET status = 'paid' WHERE id = %L$q$, tests.id('run:A2')), NULL, 'Only payroll admins can approve or pay a payroll run',
                         'and a payment');
SELECT set_config('storm.access_engine', 'on', true);
SELECT tests.throws_like(format($q$UPDATE public.profiles SET role = 'master' WHERE user_id = %L$q$, tests.user_id('A.crew_hyd')), '42501', 'Only HR admins can change role%',
                         'profiles_guard_privileged_columns refuses a role change by the inactive RBAC HR admin');
SELECT set_config('storm.access_engine', '', true);
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.payroll_runs WHERE id = tests.id('run:A2')), 'calculated', 'the run is unchanged');
SELECT tests.is((SELECT role::text FROM public.profiles WHERE user_id = tests.user_id('A.crew_hyd')), 'crew', 'the role is unchanged');

-- Review round 7 (payroll-guard-refuses-no-jwt, D-248): payroll_can_admin()
-- is two-valued now, so the approve / pay gate of
-- payroll_runs_guard_transitions() asks a signed-in caller only; the
-- trusted no-JWT context (the SQL editor, pg_cron, the service role)
-- approves and pays again, and the inactive refusals above still hold.
-- Ports scratchpad probe-payroll-nojwt.sql.
SAVEPOINT payroll_nojwt;
SELECT tests.reset_role();
SELECT tests.lives(format($q$UPDATE public.payroll_runs SET status = 'approved' WHERE id = %L$q$, tests.id('run:A2')), 'without a JWT a payroll run is approved');
SELECT tests.ok((SELECT status = 'approved' AND approved_by IS NULL AND approved_at IS NOT NULL FROM public.payroll_runs WHERE id = tests.id('run:A2')),
                'approved_by stays NULL (no caller), approved_at is set');
SELECT tests.lives(format($q$UPDATE public.payroll_runs SET status = 'paid' WHERE id = %L$q$, tests.id('run:A2')), 'and paid');
SELECT tests.throws_like(format($q$UPDATE public.payroll_runs SET status = 'approved' WHERE id = %L$q$, tests.id('run:A2')), NULL, 'A paid payroll run cannot change status',
                         'a paid run still never changes status');
ROLLBACK TO SAVEPOINT payroll_nojwt;
SAVEPOINT payroll_nojwt;
SELECT tests.as_service();
SELECT tests.lives(format($q$UPDATE public.payroll_runs SET status = 'approved' WHERE id = %L$q$, tests.id('run:A2')), 'the service role approves a payroll run');
SELECT tests.reset_role();
ROLLBACK TO SAVEPOINT payroll_nojwt;
SELECT tests.is((SELECT status FROM public.payroll_runs WHERE id = tests.id('run:A2')), 'calculated', 'setup restored: the run is calculated');
SELECT tests.ok(position('auth.uid() IS NOT NULL' IN pg_get_functiondef('public.payroll_runs_guard_transitions()'::regprocedure)) > 0,
                'the approve / pay gate asks a signed-in caller only (D-248)');
SELECT tests.ok(NOT has_function_privilege('anon', 'public.payroll_runs_guard_transitions()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.payroll_runs_guard_transitions()', 'EXECUTE'),
                'payroll_runs_guard_transitions is executable by neither anon nor authenticated');

-- ------------------------------------------------------------ inventory

-- Every public plpgsql SECURITY DEFINER function the browser can execute,
-- and every "IF NOT <callee>(" in its body.
CREATE TEMP TABLE inv_definer ON COMMIT DROP AS
SELECT p.oid, p.oid::regprocedure::text AS ident, p.prosrc
FROM pg_proc AS p
JOIN pg_language AS l ON l.oid = p.prolang
WHERE p.pronamespace = 'public'::regnamespace AND l.lanname = 'plpgsql' AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
CREATE TEMP TABLE inv_callee ON COMMIT DROP AS
SELECT DISTINCT lower(m[2]) AS callee
FROM inv_definer AS d, regexp_matches(d.prosrc, 'IF\s+NOT\s+(public\.)?([a-z0-9_]+)\s*\(', 'gi') AS m;
-- The callees that can answer for a caller: public functions with a boolean
-- overload taking a uuid first.
CREATE TEMP TABLE inv_required ON COMMIT DROP AS
SELECT c.callee,
       bool_or(p.pronargs = 1) AS one_arg
FROM inv_callee AS c
JOIN pg_proc AS p ON p.pronamespace = 'public'::regnamespace AND p.proname = c.callee
WHERE p.prorettype = 'boolean'::regtype AND p.pronargs >= 1 AND p.proargtypes[0] = 'uuid'::regtype
GROUP BY c.callee;

-- Probes: an expression evaluated with the persona's JWT (as the superuser,
-- as a definer evaluates its callee); one-argument helpers default to
-- (auth.uid()).
CREATE TEMP TABLE inv_probe (callee text PRIMARY KEY, expr text) ON COMMIT DROP;
INSERT INTO inv_probe VALUES
  ('user_belongs_to_company', format('public.user_belongs_to_company(auth.uid(), %L)', tests.company_id('A'))),
  ('has_any_role', 'public.has_any_role(auth.uid(), enum_range(NULL::public.app_role))'),
  ('has_capability_for', format('public.has_capability_for(auth.uid(), %L, %L, NULL)', 'users_access.admin', tests.company_id('A'))),
  ('has_capability', format('public.has_capability(%L, %L, NULL)', 'users_access.admin', tests.company_id('A'))),
  ('is_company_actor', 'public.is_company_actor(auth.uid(), NULL)'),
  ('admin_scope_all', format('public.admin_scope_all(auth.uid(), %L)', tests.company_id('A'))),
  ('admin_may_act_on_user', format('public.admin_may_act_on_user(auth.uid(), %L, %L, NULL)', tests.user_id('A.crew_hyd'), tests.company_id('A'))),
  ('record_readable', format('public.record_readable(%L, %L)', tests.company_id('A'), tests.vessel_id('A.dra'))),
  ('record_caller_may_write', format('public.record_caller_may_write(auth.uid(), %L, %L)', tests.company_id('A'), tests.vessel_id('A.dra')));
INSERT INTO inv_probe
SELECT r.callee, format('public.%I(auth.uid())', r.callee) FROM inv_required AS r
WHERE r.one_arg AND NOT EXISTS (SELECT 1 FROM inv_probe AS x WHERE x.callee = r.callee);

-- Callees that decide on something other than the caller, with the reason.
CREATE TEMP TABLE inv_allow (callee text PRIMARY KEY, reason text NOT NULL) ON COMMIT DROP;
INSERT INTO inv_allow VALUES
  ('record_slot_eligible', 'decides on a signature slot and the signing profile, not on the caller; record_sign_slot() and record_pass_slot() ask record_readable() / record_caller_may_write() about the active caller first (probed here)');
-- Definers that may compare with "<> my_profile_id() / get_user_company_id()
-- / current_user_company_id()", with the reason (none today).
CREATE TEMP TABLE inv_ne_allow (ident text PRIMARY KEY, reason text NOT NULL) ON COMMIT DROP;
GRANT SELECT ON inv_definer, inv_callee, inv_required, inv_probe, inv_allow, inv_ne_allow TO PUBLIC;

SELECT tests.ok((SELECT count(*) FROM inv_definer) >= 50, format('inventory: %s browser-executable plpgsql definers (sanity)', (SELECT count(*) FROM inv_definer)));
SELECT tests.ok((SELECT count(*) FROM inv_required) >= 10, format('inventory: %s boolean uuid-first IF NOT callees: %s', (SELECT count(*) FROM inv_required),
                (SELECT string_agg(callee, ', ' ORDER BY callee) FROM inv_required)));
SELECT tests.ok(EXISTS (SELECT 1 FROM inv_required WHERE callee = 'payroll_can_admin') AND EXISTS (SELECT 1 FROM inv_required WHERE callee = 'legal_can_edit'),
                'inventory: the gates of the finding are found (payroll_can_admin, legal_can_edit)');
SELECT tests.is_empty($q$SELECT callee FROM inv_required WHERE callee NOT IN (SELECT callee FROM inv_probe) AND callee NOT IN (SELECT callee FROM inv_allow)$q$,
                      'inventory: every boolean uuid-first IF NOT callee has a probe or an allow-listed reason');
SELECT tests.is_empty($q$SELECT callee FROM inv_allow WHERE callee NOT IN (SELECT callee FROM inv_required)$q$, 'inventory: no stale allow-list entry');
SELECT tests.is_empty(
  $q$SELECT ident FROM inv_definer
     WHERE prosrc ~ '<>\s*(public\.)?(my_profile_id|get_user_company_id|current_user_company_id)\s*\('
       AND ident NOT IN (SELECT ident FROM inv_ne_allow)$q$,
  'inventory: no browser-executable definer compares with <> my_profile_id() / get_user_company_id() / current_user_company_id() (IS DISTINCT FROM)');
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '# inventory callees: %', (SELECT string_agg(callee, ', ' ORDER BY callee) FROM inv_callee);
  RAISE NOTICE '# probed: %', (SELECT string_agg(callee, ', ' ORDER BY callee) FROM inv_probe);
  FOR r IN SELECT * FROM inv_allow ORDER BY callee LOOP
    RAISE NOTICE '# allow-listed: % (%)', r.callee, r.reason;
  END LOOP;
END
$$;

-- Each probe, as each inactive persona, IS FALSE.
DO $$
DECLARE p text; pr record; v boolean;
BEGIN
  FOR p IN SELECT k FROM persona ORDER BY k LOOP
    PERFORM tests.as_user(tests.user_id(p));
    RESET ROLE;   -- the superuser, with the persona's JWT (a definer's view of its callee)
    FOR pr IN SELECT * FROM inv_probe ORDER BY callee LOOP
      EXECUTE 'SELECT ' || pr.expr INTO v;
      PERFORM tests.is(v, false, format('inventory probe as %s: %s IS FALSE', p, pr.expr));
    END LOOP;
  END LOOP;
END
$$;
SELECT tests.reset_role();
