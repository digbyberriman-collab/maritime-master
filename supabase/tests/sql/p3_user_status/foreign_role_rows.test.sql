-- A user_roles row that names another company gives nothing anywhere
-- (CC-5, D-181; review round 2, has-any-role-honours-foreign-rows):
-- has_role / has_any_role (20261123010000) count a row only in its
-- holder's own profile company, so the legacy policies and the
-- company-blind definers built on them (hr_*, payroll_*, vessels_select's
-- hr_can_view, webhook_configurations, gdpr_requests, …) stop honouring a
-- foreign row; hr_anonymize_profile also needs an own-company users-access
-- admin. Controls: an own-company row still works, and a company-less
-- non-superadmin row counts in its holder's own company only.

SELECT tests.seed_two_tenants();

-- Foreign-row personas.
SELECT tests.seed_user('A', 'A.ur_dpa_other', 'crew');            -- crew of A, dpa row naming B
SELECT tests.seed_user_role('A.ur_dpa_other', 'dpa', 'B');
SELECT tests.seed_user('A', 'A.ur_purser_other', 'crew');         -- crew of A on HYDRA, purser row naming B
SELECT tests.seed_user_role('A.ur_purser_other', 'purser', 'B');
SELECT tests.seed_assignment('A.ur_purser_other', 'A.hyd', true, 'Purser');
SELECT tests.seed_user('B', 'B.crew_fr', 'crew');                 -- crew of B, dpa row naming A
SELECT tests.seed_user_role('B.crew_fr', 'dpa', 'A');
-- Controls.
SELECT tests.seed_user('A', 'A.ur_dpa_own', 'crew');              -- dpa row naming A
SELECT tests.seed_user_role('A.ur_dpa_own', 'dpa', 'A');
SELECT tests.seed_user('B', 'B.ur_dpa_own', 'crew');              -- dpa row naming B
SELECT tests.seed_user_role('B.ur_dpa_own', 'dpa', 'B');
SELECT tests.seed_user('A', 'A.ur_null', 'crew');                 -- a company-less dpa row
SELECT tests.seed_user_role('A.ur_null', 'dpa', NULL);
SELECT tests.seed_user('A', 'A.victim', 'crew');
SELECT tests.seed_user('A', 'A.victim2', 'crew');

-- Data of both companies.
INSERT INTO public.webhook_configurations (id, company_id, name, webhook_secret)
VALUES (tests.id('hook:A'), tests.company_id('A'), 'A hook', 'whsec_a_example'),
       (tests.id('hook:B'), tests.company_id('B'), 'B hook', 'whsec_b_example');
INSERT INTO public.gdpr_requests (id, company_id, subject_user_id, request_type, requested_by, deadline_date)
VALUES (tests.id('gdpr:B'), tests.company_id('B'), tests.user_id('B.admin'), 'access', tests.user_id('B.admin'), current_date + 30);

-- ------------------------------------------------------------ the helpers

SELECT tests.ok(NOT public.has_any_role(tests.user_id(k), ARRAY['dpa', 'purser']::public.app_role[]), k || ': has_any_role ignores the foreign row')
FROM unnest(ARRAY['A.ur_dpa_other', 'A.ur_purser_other', 'B.crew_fr']) AS k;
SELECT tests.ok(NOT public.has_role(tests.user_id(k), 'dpa'), k || ': has_role ignores it too')
FROM unnest(ARRAY['A.ur_dpa_other', 'B.crew_fr']) AS k;
SELECT tests.ok(NOT public.hr_can_admin(tests.user_id(k)), k || ': hr_can_admin is false')
FROM unnest(ARRAY['A.ur_dpa_other', 'B.crew_fr']) AS k;
SELECT tests.ok(NOT public.hr_can_edit(tests.user_id(k)), k || ': hr_can_edit is false')
FROM unnest(ARRAY['A.ur_dpa_other', 'A.ur_purser_other', 'B.crew_fr']) AS k;
SELECT tests.ok(NOT public.payroll_can_admin(tests.user_id(k)), k || ': payroll_can_admin is false')
FROM unnest(ARRAY['A.ur_dpa_other', 'A.ur_purser_other', 'B.crew_fr']) AS k;
SELECT tests.ok(NOT public.hr_can_view(tests.user_id('A.ur_purser_other')), 'A.ur_purser_other: hr_can_view is false (no cross-fleet vessel read)');
SELECT tests.ok(NOT public.legacy_user_admin(tests.user_id('A.ur_dpa_other')), 'A.ur_dpa_other is no legacy admin (CC-5, unchanged)');
-- Controls.
SELECT tests.ok(public.has_any_role(tests.user_id('A.ur_dpa_own'), ARRAY['dpa']::public.app_role[]) AND public.hr_can_admin(tests.user_id('A.ur_dpa_own')),
                'control: an own-company dpa row still counts (hr_can_admin)');
SELECT tests.ok(public.has_any_role(tests.user_id('A.ur_null'), ARRAY['dpa']::public.app_role[]),
                'control: a company-less dpa row counts for its holder (own company)');
SELECT tests.ok(NOT public.has_role_in_company(tests.user_id('A.ur_null'), ARRAY['dpa']::public.app_role[], tests.company_id('B')),
                'control: and never in another company');

-- ------------------------------------------------------------ hr_anonymize_profile

SELECT tests.as_user(tests.user_id('A.ur_dpa_other'));
SELECT tests.throws(format($q$SELECT public.hr_anonymize_profile(%L, 'Erasure request')$q$, tests.profile_id('A.victim')), '42501',
                    'a crew member with a dpa row naming another company cannot anonymise a colleague');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT p.first_name, p.account_status, m.status, public.user_is_active(p.user_id) FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.victim')),
  $q$VALUES ('Crew'::text, 'active'::text, 'active'::text, true)$q$,
  'the victim is unchanged (name, status, membership, active)');
SELECT tests.is((SELECT count(*) FROM public.admin_action_log WHERE target_crew_id = tests.profile_id('A.victim')), 0::bigint, 'and nothing was logged');
-- An HR admin without users-access admin (RBAC hr:admin only) is refused too.
SELECT tests.seed_role('hr_lead_test', 'vessel');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT id, 'hr', 'admin', 'fleet' FROM public.roles WHERE name = 'hr_lead_test'
ON CONFLICT DO NOTHING;
SELECT tests.seed_user('A', 'A.hr_lead', 'crew');
SELECT tests.seed_rbac_role('A.hr_lead', 'hr_lead_test');
SELECT tests.ok(public.hr_can_admin(tests.user_id('A.hr_lead')) AND NOT public.has_capability_for(tests.user_id('A.hr_lead'), 'admin.access.users_access.admin', tests.company_id('A')),
                'A.hr_lead: hr_can_admin through RBAC hr:admin, not a users-access admin');
SELECT tests.as_user(tests.user_id('A.hr_lead'));
SELECT tests.throws_like(format($q$SELECT public.hr_anonymize_profile(%L, 'Erasure request')$q$, tests.profile_id('A.victim2')), '42501', 'not_permitted',
                         'an HR admin who is not a users-access admin cannot anonymise (and disable) an account');
SELECT tests.reset_role();
-- Control: the own-company dpa row anonymises.
SELECT tests.as_user(tests.user_id('A.ur_dpa_own'));
SELECT tests.lives(format($q$SELECT public.hr_anonymize_profile(%L, 'Erasure request')$q$, tests.profile_id('A.victim2')), 'control: an own-company dpa row anonymises a colleague');
SELECT tests.reset_role();
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.victim2')), 'disabled', 'control: the account is disabled');

-- ------------------------------------------------------------ vessels_select (hr_can_view)

SELECT tests.as_user(tests.user_id('A.ur_purser_other'));
SELECT tests.results_eq('SELECT id FROM public.vessels', format('VALUES (%L::uuid)', tests.vessel_id('A.hyd')),
                        'a purser row naming another company widens nothing: only the reached vessel (HYDRA)');
SELECT tests.reset_role();

-- ------------------------------------------------------------ webhook_configurations and gdpr_requests

SELECT tests.as_user(tests.user_id('B.crew_fr'));
SELECT tests.is_empty('SELECT 1 FROM public.webhook_configurations', 'a B crew member with a dpa row naming A reads no webhook configuration (secrets included)');
SELECT tests.denied($q$UPDATE public.webhook_configurations SET name = 'changed' RETURNING id$q$, 'nor updates one');
SELECT tests.is_empty('SELECT 1 FROM public.gdpr_requests', 'nor reads a GDPR request');
SELECT tests.as_user(tests.user_id('A.ur_dpa_other'));
SELECT tests.is_empty('SELECT 1 FROM public.webhook_configurations', 'an A crew member with a dpa row naming B reads no webhook configuration');
SELECT tests.is_empty('SELECT 1 FROM public.gdpr_requests', 'nor a GDPR request');
SELECT tests.reset_role();
SELECT tests.is((SELECT name FROM public.webhook_configurations WHERE id = tests.id('hook:B')), 'B hook', 'B''s webhook is unchanged');
-- Controls.
SELECT tests.as_user(tests.user_id('B.ur_dpa_own'));
SELECT tests.results_eq('SELECT name FROM public.webhook_configurations', $$VALUES ('B hook'::text)$$, 'control: B''s own dpa row reads B''s webhook only');
SELECT tests.is((SELECT count(*) FROM public.gdpr_requests), 1::bigint, 'control: and B''s GDPR request');
SELECT tests.as_user(tests.user_id('A.ur_null'));
SELECT tests.results_eq('SELECT name FROM public.webhook_configurations', $$VALUES ('A hook'::text)$$,
                        'control: a company-less dpa row reads its holder''s own company only');
SELECT tests.reset_role();
