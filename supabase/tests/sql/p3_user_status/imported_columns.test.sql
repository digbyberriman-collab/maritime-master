-- The pending vessel placement is not writable by the person or by an HR
-- editor (review round 3, profile-imported-columns-unguarded; D-175,
-- D-184, D-198, D-204): profiles.is_imported / imported_vessel_id are what
-- fulfil_imported_assignment() turns into a crew assignment under the
-- engine flag, and what admin_may_act_on_user() reads for a person with no
-- login, so profiles_guard_access_columns (20261123010000) refuses, for a
-- signed-in caller without storm.access_engine:
--   - a change of either column on your own row;
--   - is_imported false -> true;
--   - any other change without users-access admin of the company, of the
--     old and the new vessel, and admin_may_act_on_user() on the person;
--   - while a placement is pending, a change of position, rank or
--     joining_date without users-access admin of the pending vessel;
--   - a new profile with an imported_vessel_id unless the caller is a
--     users-access admin of that vessel.
-- Ports scratchpad r2sec/s1_fulfil_self.sql, r2sec/s4_imported_scope.sql
-- and vfy-imported/s6_master_makes_master.sql as regression tests.

SELECT tests.seed_two_tenants();
-- An invitee who has signed up through their invitation: a login, profile
-- invited, no crew assignment.
SELECT tests.seed_user('A', 'A.invitee', 'crew', 'invited');
-- A colleague the DRAAK Master would like to make Master (a login, no vessel).
SELECT tests.seed_user('A', 'A.shore_inv', 'crew', 'invited');
-- A pending crew member as create-crew-member writes them (no login).
SELECT tests.seed_profile('A', 'A.pend_dra', 'crew', 'not_invited', NULL,
  jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra'), 'position', 'Bosun', 'rank', 'Rating', 'joining_date', (current_date + 7)::text));
-- A non-legacy admin of HYDRA only (users-access write, does not manage
-- admins) with legacy HR edit (a purser row), and one of HYDRA and DRAAK.
SELECT tests.seed_user('A', 'A.ua_hyd', 'crew');
SELECT tests.seed_user('A', 'A.ua_both', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write'
WHERE user_id IN (tests.user_id('A.ua_hyd'), tests.user_id('A.ua_both'));
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT m.id, m.company_id, tests.vessel_id(v.vessel_key)
FROM public.account_memberships AS m
JOIN (VALUES ('A.ua_hyd', 'A.hyd'), ('A.ua_both', 'A.hyd'), ('A.ua_both', 'A.dra')) AS v(user_key, vessel_key) ON m.user_id = tests.user_id(v.user_key);
SELECT tests.seed_user_role(k, 'purser', 'A') FROM unnest(ARRAY['A.ua_hyd', 'A.ua_both']) AS k;
-- A signed-in shore user: no vessel, no fleet reach.
SELECT tests.seed_user('A', 'A.shore_user', 'crew');

SELECT tests.ok(public.hr_can_edit(tests.user_id(k)), k || ': an HR editor (setup)')
FROM unnest(ARRAY['A.master_dra', 'A.ua_hyd', 'A.ua_both']) AS k;
SELECT tests.ok(NOT public.has_capability_for(tests.user_id('A.master_dra'), 'admin.access.users_access.admin', tests.company_id('A'), tests.vessel_id('A.dra')),
                'setup: the DRAAK Master is not a users-access admin of DRAAK');

-- ------------------------------------------------------------ s1: the invitee's own row

SELECT tests.as_user(tests.user_id('A.invitee'));
SELECT tests.ok(public.user_is_active(auth.uid()) AND NOT public.user_can_reach_vessel(auth.uid(), tests.vessel_id('A.gam')), 'setup: the invitee is active and reaches no vessel');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_assignments (user_id, vessel_id, position, join_date, is_current) VALUES (auth.uid(), %L, 'Master', current_date, true)$q$, tests.vessel_id('A.gam')),
                         '42501', 'self_assignment_refused', 'the direct path stays refused (D-175)');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET is_imported = true, imported_vessel_id = %L, position = 'Master' WHERE user_id = auth.uid()$q$, tests.vessel_id('A.gam')),
                         '42501', 'profile_access_columns_locked', 'the invitee cannot place themselves through their own profile (s1)');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET imported_vessel_id = %L WHERE user_id = auth.uid()$q$, tests.vessel_id('A.gam')),
                         '42501', 'profile_access_columns_locked', 'nor set their own imported_vessel_id');
SELECT tests.throws_like($q$UPDATE public.profiles SET is_imported = true WHERE user_id = auth.uid()$q$,
                         '42501', 'profile_access_columns_locked', 'nor turn their own profile imported');
SELECT tests.reset_role();
-- The resend that used to fulfil the forged placement writes nothing.
SELECT tests.as_service();
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.invitee'), 'sent', NULL, NULL, tests.user_id('A.fleet_manager'), 'crew', NULL, NULL)).status, 'sent',
                'the fleet manager resends the invitation');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE user_id = tests.user_id('A.invitee')), 0::bigint, 's1: no GAME CHANGER row is written');
SELECT tests.ok(NOT public.user_can_reach_vessel(tests.user_id('A.invitee'), tests.vessel_id('A.gam')), 's1: user_can_reach_vessel stays f');
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.invitee'), tests.vessel_id('A.gam')), 's1: record_is_master stays f');

-- ------------------------------------------------------------ s6: the legacy Master as an HR editor

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET imported_vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.hyd'), tests.profile_id('A.pend_dra')),
                         '42501', 'profile_access_columns_locked', 'the Master cannot re-point a pending profile to another vessel');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET imported_vessel_id = NULL, is_imported = false WHERE id = %L$q$, tests.profile_id('A.pend_dra')),
                         '42501', 'profile_access_columns_locked', 'nor clear the placement on their own vessel');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET is_imported = true, imported_vessel_id = %L, position = 'Master' WHERE id = %L$q$, tests.vessel_id('A.dra'), tests.profile_id('A.shore_inv')),
                         '42501', 'profile_access_columns_locked', 'nor make a colleague pending on DRAAK as Master (s6)');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET is_imported = true WHERE id = %L$q$, tests.profile_id('A.shore_inv')),
                         '42501', 'profile_access_columns_locked', 'nor turn a profile imported');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET position = 'Master' WHERE id = %L$q$, tests.profile_id('A.pend_dra')),
                         '42501', 'profile_access_columns_locked', 'nor retitle a pending profile Master');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET rank = 'Captain' WHERE id = %L$q$, tests.profile_id('A.pend_dra')),
                         '42501', 'profile_access_columns_locked', 'nor change its rank');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET joining_date = current_date WHERE id = %L$q$, tests.profile_id('A.pend_dra')),
                         '42501', 'profile_access_columns_locked', 'nor its joining date');
SELECT tests.throws_like(format($q$INSERT INTO public.crew_assignments (user_id, vessel_id, position, join_date, is_current) VALUES (%L, %L, 'Master', current_date, true)$q$, tests.user_id('A.shore_inv'), tests.vessel_id('A.dra')),
                         '42501', 'master_office_change_refused', 'the direct Master row stays refused (D-198)');
-- HR edits of a profile that is not pending are unchanged.
SELECT tests.lives(format($q$UPDATE public.profiles SET rank = 'Bosun', position = 'Bosun' WHERE id = %L$q$, tests.profile_id('A.shore_inv')),
                   'the Master still edits the rank and position of a profile that is not pending');
SELECT tests.reset_role();
-- A new profile with a pending placement (the trigger as a signed-in
-- INSERT sees it; the HR editor's recruitment_hire_candidate() path).
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.master_dra'), 'role', 'authenticated'));
SELECT tests.throws_like(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role, account_status, is_imported, imported_vessel_id) VALUES (%L, 'pending-new@example.test', 'Crew', 'A.pend_new', %L, 'crew', 'not_invited', true, %L)$q$,
                                tests.profile_id('A.pend_new'), tests.company_id('A'), tests.vessel_id('A.dra')),
                         '42501', 'profile_access_columns_locked', 'nor create a profile with a pending placement, even on their own vessel');
SELECT tests.lives(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role, account_status, is_imported) VALUES (%L, 'imported-novessel@example.test', 'Crew', 'A.imp_novessel', %L, 'crew', 'not_invited', true)$q$,
                          tests.profile_id('A.imp_novessel'), tests.company_id('A')),
                   'an imported profile without a vessel places nobody and is allowed (a hire without a vessel)');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT is_imported, imported_vessel_id, position, rank, joining_date FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.pend_dra')),
  format($q$VALUES (true, %L::uuid, 'Bosun'::text, 'Rating'::text, (current_date + 7))$q$, tests.vessel_id('A.dra')),
  'the pending profile is unchanged');
-- The Master's invitation of the colleague is refused (no vessel, so an
-- all-vessels admin is needed; D-207), and no Master row appears.
SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'crew', NULL, NULL)$q$, tests.profile_id('A.shore_inv'), tests.user_id('A.master_dra')),
                         '42501', 'inviter_out_of_reach', 's6: the Master''s invitation of a vessel-less colleague is refused');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_assignments WHERE user_id = tests.user_id('A.shore_inv')), 0::bigint, 's6: no DRAAK Master row for the colleague');
SELECT tests.ok(NOT public.record_is_master(tests.user_id('A.shore_inv'), tests.vessel_id('A.dra')), 's6: record_is_master stays f');

-- ------------------------------------------------------------ s4: a HYDRA admin with HR edit

SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.ua_hyd'), tests.user_id('A.shore_user'), tests.company_id('A')),
                'setup: the HYDRA admin may not act on the vessel-less shore user');
SELECT tests.as_user(tests.user_id('A.ua_hyd'));
SELECT tests.throws_like(format($q$UPDATE public.profiles SET imported_vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.hyd'), tests.profile_id('A.shore_user')),
                         '42501', 'profile_access_columns_locked', 's4: the HYDRA admin cannot pull the shore user onto HYDRA');
SELECT tests.throws_like(format($q$UPDATE public.profiles SET imported_vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.hyd'), tests.profile_id('A.pend_dra')),
                         '42501', 'profile_access_columns_locked', 'nor re-point a DRAAK pending profile to HYDRA (DRAAK is out of reach)');
SELECT tests.reset_role();
SELECT tests.is((SELECT imported_vessel_id FROM public.profiles WHERE id = tests.profile_id('A.shore_user')), NULL::uuid, 's4: the shore user has no imported vessel');
SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.ua_hyd'), tests.user_id('A.shore_user'), tests.company_id('A')), 's4: admin_may_act_on_user stays f');
SELECT tests.as_service();
SELECT tests.throws_like(format($q$SELECT public.set_membership_status(%L, 'disabled', %L, 'probe')$q$, tests.user_id('A.shore_user'), tests.user_id('A.ua_hyd')),
                         '42501', 'not_permitted', 's4: set_membership_status still refuses the HYDRA admin');
SELECT tests.reset_role();
SELECT tests.ok(public.user_is_active(tests.user_id('A.shore_user')), 's4: the shore user stays active');

-- ------------------------------------------------------------ the rightful writers

-- A users-access admin of both vessels re-points a pending profile and edits it.
SELECT tests.as_user(tests.user_id('A.ua_both'));
SELECT tests.lives(format($q$UPDATE public.profiles SET imported_vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.hyd'), tests.profile_id('A.pend_dra')),
                   'a users-access admin of DRAAK and HYDRA re-points the pending profile');
SELECT tests.lives(format($q$UPDATE public.profiles SET position = 'Deckhand', joining_date = current_date WHERE id = %L$q$, tests.profile_id('A.pend_dra')),
                   'and edits its position and joining date (admin of the pending vessel)');
SELECT tests.reset_role();
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.ua_both'), 'role', 'authenticated'));
SELECT tests.lives(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role, account_status, is_imported, imported_vessel_id) VALUES (%L, 'pending-new@example.test', 'Crew', 'A.pend_new', %L, 'crew', 'not_invited', true, %L)$q$,
                          tests.profile_id('A.pend_new'), tests.company_id('A'), tests.vessel_id('A.hyd')),
                   'and creates a pending profile on a vessel they administer');
SELECT tests.reset_role();
SELECT tests._set_claims(jsonb_build_object('sub', tests.user_id('A.ua_hyd'), 'role', 'authenticated'));
SELECT tests.throws_like(format($q$INSERT INTO public.profiles (id, email, first_name, last_name, company_id, role, account_status, is_imported, imported_vessel_id) VALUES (%L, 'pending-dra@example.test', 'Crew', 'A.pend_dra2', %L, 'crew', 'not_invited', true, %L)$q$,
                                tests.profile_id('A.pend_dra2'), tests.company_id('A'), tests.vessel_id('A.dra')),
                         '42501', 'profile_access_columns_locked', 'but the HYDRA admin cannot create one on DRAAK');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT imported_vessel_id, position FROM public.profiles WHERE id = %L$q$, tests.profile_id('A.pend_dra')),
  format($q$VALUES (%L::uuid, 'Deckhand'::text)$q$, tests.vessel_id('A.hyd')),
  'the admin''s changes are stored');
-- The fleet manager (an all-vessels admin) moves it back.
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.lives(format($q$UPDATE public.profiles SET imported_vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.dra'), tests.profile_id('A.pend_dra')),
                   'the fleet manager re-points it');
-- A signed-in session with the engine flag (this phase's definers) is not limited.
SELECT set_config('storm.access_engine', 'on', true);
SELECT tests.lives(format($q$UPDATE public.profiles SET is_imported = true, imported_vessel_id = %L WHERE id = %L$q$, tests.vessel_id('A.gam'), tests.profile_id('A.shore_user')),
                   'storm.access_engine lets an engine definer write the placement');
SELECT set_config('storm.access_engine', '', true);
SELECT tests.reset_role();
-- The service role (create-crew-member) and no JWT (migrations) are not limited.
SELECT tests.as_service();
SELECT tests.lives(format($q$UPDATE public.profiles SET is_imported = true, imported_vessel_id = %L, position = 'Engineer' WHERE id = %L$q$, tests.vessel_id('A.hyd'), tests.profile_id('A.shore_inv')),
                   'the service role writes a pending placement');
SELECT tests.reset_role();
SELECT tests.lives(format($q$UPDATE public.profiles SET position = 'Second engineer' WHERE id = %L$q$, tests.profile_id('A.shore_inv')), 'no JWT (a migration) is not limited');
