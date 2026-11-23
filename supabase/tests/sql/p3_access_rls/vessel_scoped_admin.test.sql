-- A vessel-scoped admin acts only on users of the vessels they reach
-- (gap/01 F23; review round 2, vessel-scoped-admin-acts-outside-reach):
-- admin_may_act_on_user() (20261123000400) in set_membership_status, the
-- profile role guard, rbac_user_roles_write_allowed,
-- permission_override_write_allowed, revoke_invitation and
-- hr_anonymize_profile, and admin_may_view_user() in the admin read
-- policies (memberships, invitations, RBAC roles, user_roles, overrides).
-- A non-legacy admin of HYDRA only (the X6 shape) against users of HYDRA,
-- DRAAK, no vessel, and a disabled DRAAK crew member; the DPA unchanged.

SELECT tests.seed_two_tenants();
SELECT tests.seed_user('A', 'A.ua_write_hyd', 'crew');
SELECT tests.seed_user('A', 'A.ua_read_hyd', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write' WHERE user_id = tests.user_id('A.ua_write_hyd');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'read' WHERE user_id = tests.user_id('A.ua_read_hyd');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.hyd') FROM public.account_memberships WHERE user_id IN (tests.user_id('A.ua_write_hyd'), tests.user_id('A.ua_read_hyd'));
SELECT tests.seed_user('A', 'A.no_vessel', 'crew');                         -- a user with no vessel at all
SELECT tests.seed_assignment('A.disabled', 'A.dra', true, 'Deckhand');      -- a disabled DRAAK crew member
SELECT tests.seed_user('A', 'A.crew_hyd2', 'crew');                         -- a second HYDRA crew member
SELECT tests.seed_assignment('A.crew_hyd2', 'A.hyd', true, 'Deckhand');
-- Invitees: one on DRAAK (a login with a DRAAK assignment), one imported for HYDRA.
SELECT tests.seed_user('A', 'A.new_crew_dra', 'crew', 'invited');
SELECT tests.seed_assignment('A.new_crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.seed_profile('A', 'A.new_crew_hyd', 'crew', 'not_invited', NULL, jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.hyd')));
SELECT tests.as_service();
SELECT public.record_invitation_send(tests.profile_id(k), 'sent', NULL, NULL, tests.user_id('A.fleet_manager')) FROM unnest(ARRAY['A.new_crew_dra', 'A.new_crew_hyd']) AS k;
SELECT tests.reset_role();
-- A custom vessel role with no module rights (rank 0).
SELECT tests.seed_role('watch_keeper_test', 'vessel');
-- RBAC roles of a HYDRA and a DRAAK user.
SELECT tests.seed_rbac_role('A.crew_hyd', 'crew', 'A.hyd');
SELECT tests.seed_rbac_role('A.master_dra', 'crew', 'A.dra');

-- ------------------------------------------------------------ the helpers

SELECT tests.ok(public.has_capability_for(tests.user_id('A.ua_write_hyd'), 'admin.access.users_access.admin', tests.company_id('A'))
            AND NOT public.has_capability_for(tests.user_id('A.ua_write_hyd'), 'admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: a users-access admin of the company, but not over DRAAK');
SELECT tests.ok(NOT public.admin_scope_all(tests.user_id('A.ua_write_hyd'), tests.company_id('A')), 'the HYDRA admin is not an all-vessels admin');
SELECT tests.ok(public.admin_scope_all(tests.user_id('A.fleet_manager'), tests.company_id('A')), 'the DPA is');
SELECT tests.ok(public.admin_may_act_on_user(tests.user_id('A.ua_write_hyd'), tests.user_id('A.crew_hyd'), tests.company_id('A')), 'the HYDRA admin may act on HYDRA crew');
SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.ua_write_hyd'), tests.user_id(k), tests.company_id('A')), 'but not on ' || k)
FROM unnest(ARRAY['A.master_dra', 'A.disabled', 'A.no_vessel', 'A.fleet_manager']) AS k;
SELECT tests.ok(public.admin_may_act_on_user(tests.user_id('A.ua_write_hyd'), NULL, tests.company_id('A'), tests.profile_id('A.new_crew_hyd')),
                'an imported HYDRA invitee (no login) counts by imported_vessel_id (D-125)');
SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.ua_write_hyd'), tests.user_id('B.admin'), tests.company_id('B')), 'nor on another company''s user');
SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.ua_write_hyd'), tests.id('user:nobody'), tests.company_id('A')), 'unknown target: false');
SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.disabled'), tests.user_id('A.crew_hyd'), tests.company_id('A')), 'an inactive actor: false');
SELECT tests.ok(NOT public.admin_may_act_on_user(NULL, tests.user_id('A.crew_hyd'), tests.company_id('A')), 'a NULL actor: false');
SELECT tests.ok(NOT has_function_privilege('authenticated', f, 'EXECUTE') AND has_function_privilege('service_role', f, 'EXECUTE'), f || ': service role only')
FROM unnest(ARRAY['public.admin_scope_all(uuid,uuid)', 'public.admin_may_act_on_user(uuid,uuid,uuid,uuid)']) AS f;

-- ------------------------------------------------------------ set_membership_status (admin-actions)

SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Out of reach')$q$, tests.user_id(k), tests.user_id('A.ua_write_hyd')), '42501', 'not_permitted',
                         'the HYDRA admin cannot disable ' || k)
FROM unnest(ARRAY['A.master_dra', 'A.no_vessel']) AS k;
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'active', %L)$q$, tests.user_id(k), tests.user_id('A.ua_write_hyd')), '42501', 'not_permitted',
                         'nor enable ' || k)
FROM unnest(ARRAY['A.master_dra', 'A.disabled']) AS k;
SELECT tests.reset_role();
SELECT tests.ok(public.user_is_active(tests.user_id('A.master_dra')) AND NOT public.user_is_active(tests.user_id('A.disabled')), 'both are unchanged');
SELECT tests.as_service();
SELECT tests.lives(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'Left HYDRA')$q$, tests.user_id('A.crew_hyd2'), tests.user_id('A.ua_write_hyd')),
                   'the HYDRA admin disables HYDRA crew');
SELECT tests.lives(format($q$SELECT public.set_membership_status(%L, 'active', %L)$q$, tests.user_id('A.crew_hyd2'), tests.user_id('A.ua_write_hyd')),
                   'and enables them again (a disabled HYDRA crew member is still theirs)');
SELECT tests.lives(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'DPA action')$q$, tests.user_id('A.master_dra'), tests.user_id('A.fleet_manager')),
                   'the DPA is unchanged: disables the DRAAK Master');
SELECT tests.lives(format($q$SELECT public.set_membership_status(%L, 'active', %L)$q$, tests.user_id('A.master_dra'), tests.user_id('A.fleet_manager')), 'and enables them again');
SELECT tests.reset_role();

-- ------------------------------------------------------------ RBAC roles and overrides

SELECT tests.as_user(tests.user_id('A.ua_write_hyd'));
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id, vessel_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'watch_keeper_test'), NULL)$q$, tests.user_id(k)),
                         '42501', 'new row violates row-level security%', 'no company-wide RBAC role for ' || k)
FROM unnest(ARRAY['A.crew_hyd', 'A.master_dra']) AS k;
SELECT tests.throws_like(format($q$INSERT INTO public.rbac_user_roles (user_id, role_id, vessel_id) VALUES (%L, (SELECT id FROM public.roles WHERE name = 'watch_keeper_test'), %L)$q$, tests.user_id('A.master_dra'), tests.vessel_id('A.hyd')),
                         '42501', 'new row violates row-level security%', 'nor a HYDRA role for a DRAAK user');
SELECT tests.lives(format($q$INSERT INTO public.rbac_user_roles (id, user_id, role_id, vessel_id) VALUES (%L, %L, (SELECT id FROM public.roles WHERE name = 'watch_keeper_test'), %L)$q$, tests.id('rbac:hyd2'), tests.user_id('A.crew_hyd2'), tests.vessel_id('A.hyd')),
                   'a HYDRA role (no fleet scope, no module rights, rank 0) for HYDRA crew is allowed');
SELECT tests.ok(NOT public.permission_override_write_allowed(tests.user_id('A.master_dra'), tests.company_id('A'), 'crew', 'view'), 'no override for a DRAAK user');
SELECT tests.ok(NOT public.permission_override_write_allowed(tests.user_id('A.no_vessel'), tests.company_id('A'), 'crew', 'view'), 'nor for a user with no vessel');
SELECT tests.reset_role();

-- ------------------------------------------------------------ revoke_invitation

SELECT tests.as_user(tests.user_id('A.ua_write_hyd'));
SELECT tests.throws_like(format('SELECT public.revoke_invitation(%L)', ui.id), '42501', 'not_permitted', 'the HYDRA admin cannot revoke a DRAAK invitation')
FROM public.user_invitations AS ui WHERE ui.profile_id = tests.profile_id('A.new_crew_dra');
SELECT tests.lives(format('SELECT public.revoke_invitation(%L)', ui.id), 'but revokes the HYDRA invitee''s (no login yet)')
FROM public.user_invitations AS ui WHERE ui.profile_id = tests.profile_id('A.new_crew_hyd');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT p.account_status, m.status FROM public.profiles AS p JOIN public.account_memberships AS m ON m.user_id = p.user_id WHERE p.id = %L$q$, tests.profile_id('A.new_crew_dra')),
  $q$VALUES ('invited'::text, 'active'::text)$q$, 'the DRAAK invitee is untouched');

-- ------------------------------------------------------------ hr_anonymize_profile

SELECT tests.as_user(tests.user_id('A.ua_write_hyd'));
SELECT tests.throws(format($q$SELECT public.hr_anonymize_profile(%L, 'Erasure request')$q$, tests.profile_id('A.no_vessel')), '42501', 'the HYDRA admin cannot anonymise a user with no vessel');
SELECT tests.reset_role();

-- ------------------------------------------------------------ reads: the HYDRA reader sees HYDRA users only

SELECT tests.as_user(tests.user_id('A.ua_read_hyd'));
SELECT tests.ok(public.has_capability('admin.access.users_access.view', tests.company_id('A')), 'setup: the reader is a users-access viewer of the company');
SELECT tests.is_empty(format($q$SELECT user_id FROM public.account_memberships WHERE user_id NOT IN (%L, %L, %L, %L)$q$,
                             tests.user_id('A.crew_hyd'), tests.user_id('A.crew_hyd2'), tests.user_id('A.ua_write_hyd'), tests.user_id('A.ua_read_hyd')),
                      'account_memberships: only HYDRA users (and the reader)');
SELECT tests.ok((SELECT count(*) FROM public.account_memberships WHERE user_id IN (tests.user_id('A.crew_hyd'), tests.user_id('A.crew_hyd2'))) = 2, 'both HYDRA crew members are visible');
SELECT tests.is_empty(format('SELECT 1 FROM public.account_memberships WHERE user_id = %L', tests.user_id('A.master_dra')), 'the DRAAK Master''s membership is not');
SELECT tests.is_empty(format($q$SELECT 1 FROM public.account_membership_vessels AS mv JOIN public.account_memberships AS m ON m.id = mv.membership_id WHERE m.user_id <> %L AND m.user_id <> %L$q$,
                             tests.user_id('A.ua_write_hyd'), tests.user_id('A.ua_read_hyd')), 'membership vessel rows of HYDRA users only');
SELECT tests.results_eq('SELECT profile_id FROM public.user_invitations', format('VALUES (%L::uuid)', tests.profile_id('A.new_crew_hyd')), 'user_invitations: the HYDRA invitee''s only');
SELECT tests.is_empty(format('SELECT 1 FROM public.rbac_user_roles WHERE user_id = %L', tests.user_id('A.master_dra')), 'rbac_user_roles: none of the DRAAK Master''s');
SELECT tests.ok((SELECT count(*) FROM public.rbac_user_roles WHERE user_id = tests.user_id('A.crew_hyd')) = 1, 'the HYDRA crew member''s role is visible');
SELECT tests.reset_role();
-- The DPA still reads everyone.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.ok((SELECT count(*) FROM public.account_memberships WHERE user_id = tests.user_id('A.master_dra')) = 1, 'the DPA reads the DRAAK Master''s membership');
SELECT tests.ok((SELECT count(*) FROM public.user_invitations WHERE profile_id IN (tests.profile_id('A.new_crew_dra'), tests.profile_id('A.new_crew_hyd'))) = 2, 'and both invitations');
SELECT tests.ok((SELECT count(*) FROM public.rbac_user_roles WHERE user_id = tests.user_id('A.master_dra')) >= 1, 'and the DRAAK Master''s RBAC role');
SELECT tests.reset_role();
SELECT tests.ok(has_function_privilege('authenticated', 'public.admin_may_view_user(uuid,uuid,uuid)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.admin_may_view_user(uuid,uuid,uuid)', 'EXECUTE'),
                'admin_may_view_user: authenticated (RLS predicate), not anon');
