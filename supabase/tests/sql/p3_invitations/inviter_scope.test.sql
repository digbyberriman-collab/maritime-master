-- The inviter may act on the person (review round 3,
-- edge-admin-null-vessel-capability; D-207, gap/01 F23, W7): defence in
-- depth behind the edge's own check, reserve_invitation_attempt() answers
-- {"ok": false, "code": "forbidden"} when a given p_invited_by may not act
-- on the invitee (admin_may_act_on_user) and {"ok": false, "code":
-- "manages_admins_required"} for an administrator target and an inviter who
-- does not manage admins, before the counter, the cooldown or any write;
-- record_invitation_send() raises 42501 inviter_out_of_reach /
-- manages_admins_required in the same cases, before any write. NULL (the
-- service role, ops) is not limited. Ports scratchpad
-- review-complete/sql/vessel_admin_invite.sql.

SELECT tests.seed_two_tenants();
-- A non-legacy admin of HYDRA only, and an all-vessels admin who does not
-- manage admins.
SELECT tests.seed_user('A', 'A.ua_write_hyd', 'crew');
SELECT tests.seed_user('A', 'A.ua_all', 'crew');
UPDATE public.account_memberships SET legacy_managed = false, source = 'admin', kind = 'admin', users_access_level = 'write'
WHERE user_id IN (tests.user_id('A.ua_write_hyd'), tests.user_id('A.ua_all'));
UPDATE public.account_memberships SET vessel_scope = 'all' WHERE user_id = tests.user_id('A.ua_all');
INSERT INTO public.account_membership_vessels (membership_id, company_id, vessel_id)
SELECT id, company_id, tests.vessel_id('A.hyd') FROM public.account_memberships WHERE user_id = tests.user_id('A.ua_write_hyd');
-- A DRAAK invitee (a login and a DRAAK assignment), invited by the DPA, then revoked by the DPA.
SELECT tests.seed_user('A', 'A.new_crew_dra', 'crew', 'invited');
SELECT tests.seed_assignment('A.new_crew_dra', 'A.dra', true, 'Deckhand');
SELECT tests.as_service();
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.new_crew_dra'), 'sent', NULL, NULL, tests.user_id('A.fleet_manager'))).status, 'sent', 'setup: the DPA invites the DRAAK crew member');
SELECT tests.reset_role();
SELECT tests.as_user(tests.user_id('A.fleet_manager'));
SELECT tests.is((public.revoke_invitation((SELECT id FROM public.user_invitations WHERE profile_id = tests.profile_id('A.new_crew_dra') AND status = 'sent'))).status, 'revoked',
                'setup: and revokes the invitation');
SELECT tests.reset_role();
-- A dpa profile with no login, and pending crew on DRAAK and HYDRA.
SELECT tests.seed_profile('A', 'A.new_dpa', 'dpa', 'not_invited', NULL);
SELECT tests.seed_profile('A', 'A.pend_dra', 'crew', 'not_invited', NULL, jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.dra')));
SELECT tests.seed_profile('A', 'A.pend_hyd', 'crew', 'not_invited', NULL, jsonb_build_object('is_imported', true, 'imported_vessel_id', tests.vessel_id('A.hyd')));

SELECT tests.ok(NOT public.admin_may_act_on_user(tests.user_id('A.ua_write_hyd'), tests.user_id('A.new_crew_dra'), tests.company_id('A'), tests.profile_id('A.new_crew_dra')),
                'setup: the HYDRA admin may not act on the DRAAK invitee');
SELECT tests.ok(public.admin_scope_all(tests.user_id('A.ua_all'), tests.company_id('A')) AND NOT public.user_manages_admins_for(tests.user_id('A.ua_all'), tests.company_id('A')),
                'setup: the all-vessels admin does not manage admins');

-- ------------------------------------------------------------ the HYDRA-only admin and the DRAAK invitee

SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.new_crew_dra'), tests.user_id('A.ua_write_hyd'), 'crew'), '{"ok": false, "code": "forbidden"}'::jsonb,
                'reserve: forbidden for an inviter out of reach');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L)$q$, tests.profile_id('A.new_crew_dra'), tests.user_id('A.ua_write_hyd')),
                         '42501', 'inviter_out_of_reach', 'record: inviter_out_of_reach');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'send_failed', 'provider_rejected', NULL, %L)$q$, tests.profile_id('A.new_crew_dra'), tests.user_id('A.ua_write_hyd')),
                         '42501', 'inviter_out_of_reach', 'a failed send by that inviter is refused too');
SELECT tests.reset_role();
SELECT tests.results_eq(
  format($q$SELECT status, count(*) FROM public.user_invitations WHERE profile_id = %L GROUP BY status$q$, tests.profile_id('A.new_crew_dra')),
  $q$VALUES ('revoked'::text, 1::bigint)$q$,
  'user_invitations: still revoked 1, sent 0 (nothing reserved or written)');
SELECT tests.is((SELECT account_status FROM public.profiles WHERE id = tests.profile_id('A.new_crew_dra')), 'not_invited', 'the revoke stands (the profile is not re-invited)');

-- ------------------------------------------------------------ administrator targets

SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.new_dpa'), tests.user_id('A.ua_write_hyd'), 'admin'), '{"ok": false, "code": "forbidden"}'::jsonb,
                'the HYDRA admin may not invite the (vessel-less) DPA profile: forbidden');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'admin')$q$, tests.profile_id('A.new_dpa'), tests.user_id('A.ua_write_hyd')),
                         '42501', 'inviter_out_of_reach', 'record: inviter_out_of_reach');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.new_dpa'), tests.user_id('A.ua_all'), 'admin'), '{"ok": false, "code": "manages_admins_required"}'::jsonb,
                'an all-vessels admin who does not manage admins: manages_admins_required');
SELECT tests.throws_like(format($q$SELECT public.record_invitation_send(%L, 'sent', NULL, NULL, %L, 'admin')$q$, tests.profile_id('A.new_dpa'), tests.user_id('A.ua_all')),
                         '42501', 'manages_admins_required', 'record: manages_admins_required');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.pend_dra'), tests.user_id('A.ua_all'), 'admin'), '{"ok": false, "code": "manages_admins_required"}'::jsonb,
                'an admin-kind invitation of a crew profile needs a manager of admins too');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.user_invitations WHERE profile_id IN (tests.profile_id('A.new_dpa'), tests.profile_id('A.pend_dra'))), 0::bigint, 'nothing was written for the refusals');

-- ------------------------------------------------------------ the rightful inviters

SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.pend_dra'), tests.user_id('A.master_dra'), 'crew') ->> 'ok', 'true',
                'the legacy Master invites a pending profile on their own vessel (D-125): reserved');
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.pend_dra'), 'sent', NULL, NULL, tests.user_id('A.master_dra'), 'crew')).status, 'sent', 'and sent');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.pend_hyd'), tests.user_id('A.master_dra'), 'crew'), '{"ok": false, "code": "forbidden"}'::jsonb,
                'but not one on HYDRA');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.pend_hyd'), tests.user_id('A.ua_write_hyd'), 'crew') ->> 'ok', 'true', 'the HYDRA admin invites the HYDRA pending profile');
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.new_dpa'), tests.user_id('A.fleet_manager'), 'admin') ->> 'ok', 'true', 'the fleet manager invites the DPA profile');
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.new_dpa'), 'sent', NULL, NULL, tests.user_id('A.fleet_manager'), 'admin')).status, 'sent', 'and records it');
SELECT tests.reset_role();
-- The service role / ops (no inviter) are not limited by these checks.
UPDATE public.user_invitations SET last_attempt_at = now() - interval '10 minutes' WHERE profile_id = tests.profile_id('A.new_crew_dra');
SELECT tests.as_service();
SELECT tests.is(public.reserve_invitation_attempt(tests.profile_id('A.new_crew_dra')) ->> 'ok', 'true', 'no inviter: reserved');
SELECT tests.is((public.record_invitation_send(tests.profile_id('A.new_crew_dra'), 'sent')).status, 'sent', 'no inviter: recorded');
SELECT tests.reset_role();
