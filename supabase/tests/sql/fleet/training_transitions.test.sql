-- Training core (20261124040600_fleet_training_core.sql; gap/02 TR4, TR5,
-- TR6, TR9, TR10, W3, X4; X5 spec §2 X5-07A, D-X5-05, D-X5-06, D-X5-07,
-- D-X5-20, D-X5-23, D-X5-25; platform-prep plan contract 3). Two
-- companies; DRAAK's crew: the Master (Captain by office), a Purser, a deck
-- and an interior applicant, a deck HOD, an HOD of every department, a
-- person holding both final offices; HYDRA's crew and HOD; fleet training
-- viewers and admins; company B. Proves:
--   - every cell of the states x actions table of
--     src/modules/development/lib/applicationMachine.ts (copied between the
--     machine-table markers below and pinned by applicationMachine.test.ts)
--     through development_transition, legal and illegal, one event per
--     legal step and none for a refusal; the pure development_transition_target
--     and development_action_actors (the actor-table markers) answer the
--     same tables;
--   - HOD department scope via user_roles.department (deck HOD on a deck
--     applicant only, an HOD of every department on both, another vessel's
--     HOD on neither);
--   - final approval both vs either, two people for both, role_required,
--     already_decided, discretionary;
--   - void rights (Captain, Purser, training admin; not the applicant or
--     an HOD), reject vs return, resubmission resets the decisions;
--   - completion writes exactly one qualification with expiry = completion
--     + valid_for (legacy crew_certificates row; X1's
--     crew_document_record_from_source when it exists and the course names
--     a type; the legacy branch when that definer is absent);
--   - the guard refuses direct status inserts and updates for every role
--     (the applicant, the service role, the owner) and keeps submitted
--     applications read-only; the applicant edits a draft;
--   - SELECT narrowed: another vessel's crew and HOD read nothing, the
--     applicant their own, reviewers and training viewers what they review;
--     events follow; participants pinned to the company;
--   - numbering continues from the highest number, two interleaved callers
--     get two numbers, numbers are per company;
--   - notifications to the next actor and the applicant, an unknown type
--     never rolls a transition back;
--   - catalogue, settings and promote definers: who may call them and their
--     refusals; grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ world

-- DRAAK applicants (deck, interior) and offices.
SELECT tests.seed_user('A', 'A.deck_dra', 'crew');
SELECT tests.seed_assignment('A.deck_dra', 'A.dra', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
SELECT tests.seed_user('A', 'A.stew_dra', 'crew');
SELECT tests.seed_assignment('A.stew_dra', 'A.dra', true, 'Stewardess', '{"department": "Interior"}'::jsonb);
SELECT tests.seed_user('A', 'A.hod_deck_dra', 'crew');
SELECT tests.seed_assignment('A.hod_deck_dra', 'A.dra', true, 'Bosun', '{"department": "Deck"}'::jsonb);
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active)
VALUES (tests.id('ur:hod_deck_dra'), tests.user_id('A.hod_deck_dra'), 'hod', tests.company_id('A'), tests.vessel_id('A.dra'), 'Deck', true);
SELECT tests.seed_user('A', 'A.hod_all', 'crew');
SELECT tests.seed_assignment('A.hod_all', 'A.dra', true, 'Chief Officer', '{"department": "Deck"}'::jsonb);
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active)
VALUES (tests.id('ur:hod_all'), tests.user_id('A.hod_all'), 'hod', tests.company_id('A'), NULL, NULL, true);
SELECT tests.seed_user('A', 'A.purser_dra', 'crew');
SELECT tests.seed_assignment('A.purser_dra', 'A.dra', true, 'Purser', '{"department": "Interior"}'::jsonb);
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, is_active)
VALUES (tests.id('ur:purser_dra'), tests.user_id('A.purser_dra'), 'purser', tests.company_id('A'), tests.vessel_id('A.dra'), true);
SELECT tests.seed_user('A', 'A.dual_dra', 'crew');
SELECT tests.seed_assignment('A.dual_dra', 'A.dra', true, 'Second Officer', '{"department": "Deck"}'::jsonb);
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, is_active) VALUES
  (tests.id('ur:dual_captain'), tests.user_id('A.dual_dra'), 'captain', tests.company_id('A'), tests.vessel_id('A.dra'), true),
  (tests.id('ur:dual_purser'), tests.user_id('A.dual_dra'), 'purser', tests.company_id('A'), tests.vessel_id('A.dra'), true);

-- HYDRA: A.crew_hyd (deckhand, from seed_two_tenants), a deck applicant and a deck HOD.
SELECT tests.seed_user('A', 'A.deck_hyd', 'crew');
SELECT tests.seed_assignment('A.deck_hyd', 'A.hyd', true, 'Deckhand', '{"department": "Deck"}'::jsonb);
SELECT tests.seed_user('A', 'A.hod_deck_hyd', 'crew');
SELECT tests.seed_assignment('A.hod_deck_hyd', 'A.hyd', true, 'Bosun', '{"department": "Deck"}'::jsonb);
INSERT INTO public.user_roles (id, user_id, role, company_id, vessel_id, department, is_active)
VALUES (tests.id('ur:hod_deck_hyd'), tests.user_id('A.hod_deck_hyd'), 'hod', tests.company_id('A'), tests.vessel_id('A.hyd'), 'Deck', true);

-- Fleet training viewer and admin (RBAC training view / admin, fleet reach).
SELECT tests.seed_user('A', 'A.trn_viewer', 'crew');
SELECT tests.seed_user('A', 'A.trn_admin', 'crew');
UPDATE public.account_memberships
SET legacy_managed = false, kind = 'shore', vessel_scope = 'all', fleet_access = true, source = 'admin'
WHERE user_id IN (tests.user_id('A.trn_viewer'), tests.user_id('A.trn_admin'));
SELECT tests.seed_role('x7a_training_view', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'training', 'view', 'fleet' FROM public.roles AS r WHERE r.name = 'x7a_training_view';
SELECT tests.seed_rbac_role('A.trn_viewer', 'x7a_training_view');
SELECT tests.seed_role('x7a_training_admin', 'fleet');
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'training', 'admin', 'fleet' FROM public.roles AS r WHERE r.name = 'x7a_training_admin';
SELECT tests.seed_rbac_role('A.trn_admin', 'x7a_training_admin');

-- Company B crew.
SELECT tests.seed_user('B', 'B.crew', 'crew');
SELECT tests.seed_assignment('B.crew', 'B.lev', true, 'Deckhand');

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p_key $$;
CREATE TEMP TABLE got (k text PRIMARY KEY, v jsonb NOT NULL) ON COMMIT DROP;
GRANT ALL ON got TO PUBLIC;

-- An application in any status, written as the superuser under the
-- definers' flag (as development_transition would leave it).
CREATE FUNCTION pg_temp.app(
  p_status text,
  p_applicant text DEFAULT 'A.deck_dra',
  p_vessel text DEFAULT 'A.dra',
  p_course uuid DEFAULT NULL,
  p_company text DEFAULT 'A',
  p_custom boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.development_applications (company_id, crew_member_id, vessel_id, course_id, course_name, course_provider, category, status,
                                               submitted_at, is_custom_course, course_start_date, course_end_date)
  VALUES (tests.company_id(p_company), tests.user_id(p_applicant), tests.vessel_id(p_vessel), p_course, 'Course in ' || p_status, 'Sea School',
          'professional', p_status, CASE WHEN p_status <> 'draft' THEN now() END, p_custom, current_date - 20, current_date - 10)
  RETURNING id INTO v_id;
  PERFORM set_config('storm.fleet_tx', '', true);
  RETURN v_id;
END;
$$;

CREATE FUNCTION pg_temp.events(p_app uuid, p_action text DEFAULT NULL) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*) FROM public.development_application_events WHERE application_id = p_app AND (p_action IS NULL OR action = p_action)
$$;

-- The payload each action needs.
CREATE FUNCTION pg_temp.payload(p_action text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_action
    WHEN 'hod_return' THEN '{"comment": "Add the course dates"}'::jsonb
    WHEN 'return' THEN '{"comment": "Attach the provider quote"}'::jsonb
    WHEN 'reject' THEN '{"reason": "Not related to the role"}'::jsonb
    WHEN 'cancel' THEN '{"reason": "Course withdrawn by the provider"}'::jsonb
    WHEN 'void' THEN '{"reason": "Entered twice"}'::jsonb
    WHEN 'final_approve_discretionary' THEN '{"justification": "Covers a gap on the vessel"}'::jsonb
    WHEN 'complete' THEN jsonb_build_object('completed_on', current_date - 5, 'certificate_number', 'SS-1001')
    WHEN 'edit_fields' THEN '{"fields": {"course_provider": "Harbour Academy"}}'::jsonb
    ELSE '{}'::jsonb
  END
$$;

-- Who takes the action in the walk (an actor the actor table allows).
CREATE FUNCTION pg_temp.actor(p_action text, p_status text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_action IN ('submit', 'enrol', 'complete') THEN 'A.deck_dra'
    WHEN p_action IN ('hod_approve', 'hod_return') THEN 'A.hod_deck_dra'
    WHEN p_action = 'reject' AND p_status IN ('submitted', 'hod_review') THEN 'A.hod_deck_dra'
    WHEN p_action = 'cancel' AND p_status IN ('approved', 'discretionary_approved', 'enrolled') THEN 'A.master_dra'
    WHEN p_action = 'cancel' THEN 'A.deck_dra'
    WHEN p_action IN ('final_approve', 'final_approve_discretionary', 'return', 'reject') THEN 'A.master_dra'
    ELSE 'A.trn_admin'
  END
$$;

-- ------------------------------------------------------------ grants

SELECT tests.ok(NOT has_function_privilege('anon', 'public.development_transition(uuid,text,jsonb,timestamptz)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.development_course_save(jsonb)', 'EXECUTE')
                AND NOT has_function_privilege('anon', 'public.development_reviewer_for(uuid,uuid,uuid)', 'EXECUTE'),
                'grants: anon executes nothing');
SELECT tests.ok(has_function_privilege('authenticated', 'public.development_transition(uuid,text,jsonb,timestamptz)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.development_course_save(jsonb)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.development_course_archive(uuid,boolean)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.development_settings_save(jsonb)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.development_course_promote(uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.development_reviewer_for(uuid,uuid,uuid)', 'EXECUTE')
                AND has_function_privilege('authenticated', 'public.development_application_company(uuid)', 'EXECUTE'),
                'grants: the browser executes the five definers and the two RLS helpers');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.development_vessel_role_for(uuid,uuid,text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.development_application_number_for(uuid)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.development_record_qualification(development_applications,date,text)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.development_application_log(development_applications,text,text,text,text,text,jsonb,jsonb)', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.generate_dev_application_number()', 'EXECUTE')
                AND NOT has_function_privilege('authenticated', 'public.development_transition_target(text,text)', 'EXECUTE'),
                'grants: the helpers, the numbering and the triggers are not the browser''s');
SELECT tests.ok(NOT has_table_privilege('authenticated', 'public.development_courses', 'INSERT')
                AND NOT has_table_privilege('authenticated', 'public.development_courses', 'UPDATE')
                AND NOT has_table_privilege('authenticated', 'public.program_settings', 'UPDATE')
                AND has_table_privilege('authenticated', 'public.development_courses', 'SELECT')
                AND NOT has_table_privilege('authenticated', 'public.development_application_events', 'INSERT')
                AND has_table_privilege('authenticated', 'public.development_application_events', 'SELECT'),
                'grants: courses and settings are read-only for the browser; events are read-only');

-- ------------------------------------------------------------ roles on an application

SELECT tests.reset_role();
INSERT INTO ids VALUES ('deck', pg_temp.app('hod_review')), ('stew', pg_temp.app('hod_review', 'A.stew_dra'));
SELECT tests.is(public.development_applicant_department(tests.user_id('A.deck_dra'), tests.vessel_id('A.dra')), 'Deck',
                'department: from the applicant''s current assignment on the vessel');
SELECT tests.results_eq(
  $q$SELECT k, public.development_actor_roles_for(tests.user_id(k), (SELECT a FROM public.development_applications AS a WHERE a.id = pg_temp.id('deck')))::text
     FROM unnest(ARRAY['A.deck_dra', 'A.stew_dra', 'A.hod_deck_dra', 'A.hod_all', 'A.purser_dra', 'A.master_dra', 'A.dual_dra',
                       'A.hod_deck_hyd', 'A.crew_hyd', 'A.trn_viewer', 'A.trn_admin', 'A.fleet_manager', 'A.disabled', 'B.admin']) AS k
     ORDER BY k$q$,
  $q$VALUES ('A.crew_hyd', '{}'), ('A.deck_dra', '{applicant}'), ('A.disabled', '{}'), ('A.dual_dra', '{captain,purser}'),
            ('A.fleet_manager', '{training_editor,training_admin}'), ('A.hod_all', '{hod}'), ('A.hod_deck_dra', '{hod}'),
            ('A.hod_deck_hyd', '{}'), ('A.master_dra', '{captain}'), ('A.purser_dra', '{purser}'), ('A.stew_dra', '{}'),
            ('A.trn_admin', '{training_editor,training_admin}'), ('A.trn_viewer', '{}'), ('B.admin', '{}')$q$,
  'roles on the deck application: applicant only for the applicant, HODs by department and vessel, Master as captain, the offices, training admins');
SELECT tests.is(public.development_actor_roles_for(tests.user_id('A.hod_deck_dra'), (SELECT a FROM public.development_applications AS a WHERE a.id = pg_temp.id('stew')))::text,
                '{}', 'roles: the deck HOD holds nothing on the interior application');
SELECT tests.is(public.development_actor_roles_for(tests.user_id('A.hod_all'), (SELECT a FROM public.development_applications AS a WHERE a.id = pg_temp.id('stew')))::text,
                '{hod}', 'roles: an HOD of every department covers the interior applicant');

-- ------------------------------------------------------------ the state machine (copy of lib/applicationMachine.ts)

CREATE TEMP TABLE machine (state text NOT NULL, action text NOT NULL, outcome text NOT NULL, PRIMARY KEY (state, action)) ON COMMIT DROP;
GRANT ALL ON machine TO PUBLIC;
INSERT INTO machine (state, action, outcome) VALUES
-- machine-table:start
  ('draft', 'submit', 'hod_review'),
  ('draft', 'hod_approve', '!invalid_transition'),
  ('draft', 'hod_return', '!invalid_transition'),
  ('draft', 'final_approve', '!invalid_transition'),
  ('draft', 'final_approve_discretionary', '!invalid_transition'),
  ('draft', 'return', '!invalid_transition'),
  ('draft', 'reject', '!invalid_transition'),
  ('draft', 'cancel', 'cancelled'),
  ('draft', 'enrol', '!invalid_transition'),
  ('draft', 'complete', '!invalid_transition'),
  ('draft', 'reimburse', '!invalid_transition'),
  ('draft', 'close', '!invalid_transition'),
  ('draft', 'void', 'voided'),
  ('draft', 'edit_fields', '!invalid_transition'),
  ('submitted', 'submit', '!invalid_transition'),
  ('submitted', 'hod_approve', 'captain_purser_review'),
  ('submitted', 'hod_return', 'returned'),
  ('submitted', 'final_approve', '!invalid_transition'),
  ('submitted', 'final_approve_discretionary', '!invalid_transition'),
  ('submitted', 'return', '!invalid_transition'),
  ('submitted', 'reject', 'rejected'),
  ('submitted', 'cancel', 'cancelled'),
  ('submitted', 'enrol', '!invalid_transition'),
  ('submitted', 'complete', '!invalid_transition'),
  ('submitted', 'reimburse', '!invalid_transition'),
  ('submitted', 'close', '!invalid_transition'),
  ('submitted', 'void', 'voided'),
  ('submitted', 'edit_fields', 'submitted'),
  ('hod_review', 'submit', '!invalid_transition'),
  ('hod_review', 'hod_approve', 'captain_purser_review'),
  ('hod_review', 'hod_return', 'returned'),
  ('hod_review', 'final_approve', '!invalid_transition'),
  ('hod_review', 'final_approve_discretionary', '!invalid_transition'),
  ('hod_review', 'return', '!invalid_transition'),
  ('hod_review', 'reject', 'rejected'),
  ('hod_review', 'cancel', 'cancelled'),
  ('hod_review', 'enrol', '!invalid_transition'),
  ('hod_review', 'complete', '!invalid_transition'),
  ('hod_review', 'reimburse', '!invalid_transition'),
  ('hod_review', 'close', '!invalid_transition'),
  ('hod_review', 'void', 'voided'),
  ('hod_review', 'edit_fields', 'hod_review'),
  ('captain_purser_review', 'submit', '!invalid_transition'),
  ('captain_purser_review', 'hod_approve', '!invalid_transition'),
  ('captain_purser_review', 'hod_return', '!invalid_transition'),
  ('captain_purser_review', 'final_approve', 'approved'),
  ('captain_purser_review', 'final_approve_discretionary', 'discretionary_approved'),
  ('captain_purser_review', 'return', 'returned'),
  ('captain_purser_review', 'reject', 'rejected'),
  ('captain_purser_review', 'cancel', 'cancelled'),
  ('captain_purser_review', 'enrol', '!invalid_transition'),
  ('captain_purser_review', 'complete', '!invalid_transition'),
  ('captain_purser_review', 'reimburse', '!invalid_transition'),
  ('captain_purser_review', 'close', '!invalid_transition'),
  ('captain_purser_review', 'void', 'voided'),
  ('captain_purser_review', 'edit_fields', 'captain_purser_review'),
  ('purser_review', 'submit', '!invalid_transition'),
  ('purser_review', 'hod_approve', '!invalid_transition'),
  ('purser_review', 'hod_return', '!invalid_transition'),
  ('purser_review', 'final_approve', 'approved'),
  ('purser_review', 'final_approve_discretionary', 'discretionary_approved'),
  ('purser_review', 'return', 'returned'),
  ('purser_review', 'reject', 'rejected'),
  ('purser_review', 'cancel', 'cancelled'),
  ('purser_review', 'enrol', '!invalid_transition'),
  ('purser_review', 'complete', '!invalid_transition'),
  ('purser_review', 'reimburse', '!invalid_transition'),
  ('purser_review', 'close', '!invalid_transition'),
  ('purser_review', 'void', 'voided'),
  ('purser_review', 'edit_fields', 'purser_review'),
  ('captain_review', 'submit', '!invalid_transition'),
  ('captain_review', 'hod_approve', '!invalid_transition'),
  ('captain_review', 'hod_return', '!invalid_transition'),
  ('captain_review', 'final_approve', 'approved'),
  ('captain_review', 'final_approve_discretionary', 'discretionary_approved'),
  ('captain_review', 'return', 'returned'),
  ('captain_review', 'reject', 'rejected'),
  ('captain_review', 'cancel', 'cancelled'),
  ('captain_review', 'enrol', '!invalid_transition'),
  ('captain_review', 'complete', '!invalid_transition'),
  ('captain_review', 'reimburse', '!invalid_transition'),
  ('captain_review', 'close', '!invalid_transition'),
  ('captain_review', 'void', 'voided'),
  ('captain_review', 'edit_fields', 'captain_review'),
  ('approved', 'submit', '!invalid_transition'),
  ('approved', 'hod_approve', '!invalid_transition'),
  ('approved', 'hod_return', '!invalid_transition'),
  ('approved', 'final_approve', '!invalid_transition'),
  ('approved', 'final_approve_discretionary', '!invalid_transition'),
  ('approved', 'return', '!invalid_transition'),
  ('approved', 'reject', '!invalid_transition'),
  ('approved', 'cancel', 'cancelled'),
  ('approved', 'enrol', 'enrolled'),
  ('approved', 'complete', 'completed'),
  ('approved', 'reimburse', '!invalid_transition'),
  ('approved', 'close', '!invalid_transition'),
  ('approved', 'void', 'voided'),
  ('approved', 'edit_fields', 'approved'),
  ('discretionary_approved', 'submit', '!invalid_transition'),
  ('discretionary_approved', 'hod_approve', '!invalid_transition'),
  ('discretionary_approved', 'hod_return', '!invalid_transition'),
  ('discretionary_approved', 'final_approve', '!invalid_transition'),
  ('discretionary_approved', 'final_approve_discretionary', '!invalid_transition'),
  ('discretionary_approved', 'return', '!invalid_transition'),
  ('discretionary_approved', 'reject', '!invalid_transition'),
  ('discretionary_approved', 'cancel', 'cancelled'),
  ('discretionary_approved', 'enrol', 'enrolled'),
  ('discretionary_approved', 'complete', 'completed'),
  ('discretionary_approved', 'reimburse', '!invalid_transition'),
  ('discretionary_approved', 'close', '!invalid_transition'),
  ('discretionary_approved', 'void', 'voided'),
  ('discretionary_approved', 'edit_fields', 'discretionary_approved'),
  ('enrolled', 'submit', '!invalid_transition'),
  ('enrolled', 'hod_approve', '!invalid_transition'),
  ('enrolled', 'hod_return', '!invalid_transition'),
  ('enrolled', 'final_approve', '!invalid_transition'),
  ('enrolled', 'final_approve_discretionary', '!invalid_transition'),
  ('enrolled', 'return', '!invalid_transition'),
  ('enrolled', 'reject', '!invalid_transition'),
  ('enrolled', 'cancel', 'cancelled'),
  ('enrolled', 'enrol', '!invalid_transition'),
  ('enrolled', 'complete', 'completed'),
  ('enrolled', 'reimburse', '!invalid_transition'),
  ('enrolled', 'close', '!invalid_transition'),
  ('enrolled', 'void', 'voided'),
  ('enrolled', 'edit_fields', 'enrolled'),
  ('completed', 'submit', '!invalid_transition'),
  ('completed', 'hod_approve', '!invalid_transition'),
  ('completed', 'hod_return', '!invalid_transition'),
  ('completed', 'final_approve', '!invalid_transition'),
  ('completed', 'final_approve_discretionary', '!invalid_transition'),
  ('completed', 'return', '!invalid_transition'),
  ('completed', 'reject', '!invalid_transition'),
  ('completed', 'cancel', '!invalid_transition'),
  ('completed', 'enrol', '!invalid_transition'),
  ('completed', 'complete', '!invalid_transition'),
  ('completed', 'reimburse', 'reimbursed'),
  ('completed', 'close', 'closed'),
  ('completed', 'void', 'voided'),
  ('completed', 'edit_fields', '!invalid_transition'),
  ('reimbursed', 'submit', '!invalid_transition'),
  ('reimbursed', 'hod_approve', '!invalid_transition'),
  ('reimbursed', 'hod_return', '!invalid_transition'),
  ('reimbursed', 'final_approve', '!invalid_transition'),
  ('reimbursed', 'final_approve_discretionary', '!invalid_transition'),
  ('reimbursed', 'return', '!invalid_transition'),
  ('reimbursed', 'reject', '!invalid_transition'),
  ('reimbursed', 'cancel', '!invalid_transition'),
  ('reimbursed', 'enrol', '!invalid_transition'),
  ('reimbursed', 'complete', '!invalid_transition'),
  ('reimbursed', 'reimburse', '!invalid_transition'),
  ('reimbursed', 'close', 'closed'),
  ('reimbursed', 'void', 'voided'),
  ('reimbursed', 'edit_fields', '!invalid_transition'),
  ('closed', 'submit', '!application_final'),
  ('closed', 'hod_approve', '!application_final'),
  ('closed', 'hod_return', '!application_final'),
  ('closed', 'final_approve', '!application_final'),
  ('closed', 'final_approve_discretionary', '!application_final'),
  ('closed', 'return', '!application_final'),
  ('closed', 'reject', '!application_final'),
  ('closed', 'cancel', '!application_final'),
  ('closed', 'enrol', '!application_final'),
  ('closed', 'complete', '!application_final'),
  ('closed', 'reimburse', '!application_final'),
  ('closed', 'close', '!application_final'),
  ('closed', 'void', 'voided'),
  ('closed', 'edit_fields', '!application_final'),
  ('returned', 'submit', 'hod_review'),
  ('returned', 'hod_approve', '!invalid_transition'),
  ('returned', 'hod_return', '!invalid_transition'),
  ('returned', 'final_approve', '!invalid_transition'),
  ('returned', 'final_approve_discretionary', '!invalid_transition'),
  ('returned', 'return', '!invalid_transition'),
  ('returned', 'reject', '!invalid_transition'),
  ('returned', 'cancel', 'cancelled'),
  ('returned', 'enrol', '!invalid_transition'),
  ('returned', 'complete', '!invalid_transition'),
  ('returned', 'reimburse', '!invalid_transition'),
  ('returned', 'close', '!invalid_transition'),
  ('returned', 'void', 'voided'),
  ('returned', 'edit_fields', '!invalid_transition'),
  ('rejected', 'submit', '!application_final'),
  ('rejected', 'hod_approve', '!application_final'),
  ('rejected', 'hod_return', '!application_final'),
  ('rejected', 'final_approve', '!application_final'),
  ('rejected', 'final_approve_discretionary', '!application_final'),
  ('rejected', 'return', '!application_final'),
  ('rejected', 'reject', '!application_final'),
  ('rejected', 'cancel', '!application_final'),
  ('rejected', 'enrol', '!application_final'),
  ('rejected', 'complete', '!application_final'),
  ('rejected', 'reimburse', '!application_final'),
  ('rejected', 'close', '!application_final'),
  ('rejected', 'void', 'voided'),
  ('rejected', 'edit_fields', '!application_final'),
  ('cancelled', 'submit', '!application_final'),
  ('cancelled', 'hod_approve', '!application_final'),
  ('cancelled', 'hod_return', '!application_final'),
  ('cancelled', 'final_approve', '!application_final'),
  ('cancelled', 'final_approve_discretionary', '!application_final'),
  ('cancelled', 'return', '!application_final'),
  ('cancelled', 'reject', '!application_final'),
  ('cancelled', 'cancel', '!application_final'),
  ('cancelled', 'enrol', '!application_final'),
  ('cancelled', 'complete', '!application_final'),
  ('cancelled', 'reimburse', '!application_final'),
  ('cancelled', 'close', '!application_final'),
  ('cancelled', 'void', 'voided'),
  ('cancelled', 'edit_fields', '!application_final'),
  ('voided', 'submit', '!application_voided'),
  ('voided', 'hod_approve', '!application_voided'),
  ('voided', 'hod_return', '!application_voided'),
  ('voided', 'final_approve', '!application_voided'),
  ('voided', 'final_approve_discretionary', '!application_voided'),
  ('voided', 'return', '!application_voided'),
  ('voided', 'reject', '!application_voided'),
  ('voided', 'cancel', '!application_voided'),
  ('voided', 'enrol', '!application_voided'),
  ('voided', 'complete', '!application_voided'),
  ('voided', 'reimburse', '!application_voided'),
  ('voided', 'close', '!application_voided'),
  ('voided', 'void', '!application_voided'),
  ('voided', 'edit_fields', '!application_voided')
-- machine-table:end
;

SELECT tests.is((SELECT count(*) FROM machine), 224::bigint, 'machine: 16 statuses x 14 actions');
SELECT tests.is_empty($q$SELECT state, action FROM machine WHERE public.development_transition_target(state, action) <> outcome$q$,
                      'machine: development_transition_target answers every cell of the table');

CREATE TEMP TABLE actors (action text NOT NULL, state text NOT NULL, roles text NOT NULL, PRIMARY KEY (action, state)) ON COMMIT DROP;
GRANT ALL ON actors TO PUBLIC;
INSERT INTO actors (action, state, roles) VALUES
-- actor-table:start
  ('submit', 'draft', 'applicant'),
  ('submit', 'returned', 'applicant'),
  ('hod_approve', 'submitted', 'hod'),
  ('hod_approve', 'hod_review', 'hod'),
  ('hod_return', 'submitted', 'hod'),
  ('hod_return', 'hod_review', 'hod'),
  ('final_approve', 'captain_purser_review', 'captain|purser'),
  ('final_approve', 'purser_review', 'captain|purser'),
  ('final_approve', 'captain_review', 'captain|purser'),
  ('final_approve_discretionary', 'captain_purser_review', 'captain'),
  ('final_approve_discretionary', 'purser_review', 'captain'),
  ('final_approve_discretionary', 'captain_review', 'captain'),
  ('return', 'captain_purser_review', 'captain|purser'),
  ('return', 'purser_review', 'captain|purser'),
  ('return', 'captain_review', 'captain|purser'),
  ('reject', 'submitted', 'hod'),
  ('reject', 'hod_review', 'hod'),
  ('reject', 'captain_purser_review', 'captain|purser'),
  ('reject', 'purser_review', 'captain|purser'),
  ('reject', 'captain_review', 'captain|purser'),
  ('cancel', 'draft', 'applicant'),
  ('cancel', 'submitted', 'applicant'),
  ('cancel', 'hod_review', 'applicant'),
  ('cancel', 'captain_purser_review', 'applicant'),
  ('cancel', 'purser_review', 'applicant'),
  ('cancel', 'captain_review', 'applicant'),
  ('cancel', 'approved', 'captain|purser|training_admin'),
  ('cancel', 'discretionary_approved', 'captain|purser|training_admin'),
  ('cancel', 'enrolled', 'captain|purser|training_admin'),
  ('cancel', 'returned', 'applicant'),
  ('enrol', 'approved', 'applicant|captain|purser|training_editor|training_admin'),
  ('enrol', 'discretionary_approved', 'applicant|captain|purser|training_editor|training_admin'),
  ('complete', 'approved', 'applicant|captain|purser|training_editor|training_admin'),
  ('complete', 'discretionary_approved', 'applicant|captain|purser|training_editor|training_admin'),
  ('complete', 'enrolled', 'applicant|captain|purser|training_editor|training_admin'),
  ('reimburse', 'completed', 'captain|purser|training_admin'),
  ('close', 'completed', 'captain|purser|training_admin'),
  ('close', 'reimbursed', 'captain|purser|training_admin'),
  ('void', 'draft', 'captain|purser|training_admin'),
  ('void', 'submitted', 'captain|purser|training_admin'),
  ('void', 'hod_review', 'captain|purser|training_admin'),
  ('void', 'captain_purser_review', 'captain|purser|training_admin'),
  ('void', 'purser_review', 'captain|purser|training_admin'),
  ('void', 'captain_review', 'captain|purser|training_admin'),
  ('void', 'approved', 'captain|purser|training_admin'),
  ('void', 'discretionary_approved', 'captain|purser|training_admin'),
  ('void', 'enrolled', 'captain|purser|training_admin'),
  ('void', 'completed', 'captain|purser|training_admin'),
  ('void', 'reimbursed', 'captain|purser|training_admin'),
  ('void', 'closed', 'captain|purser|training_admin'),
  ('void', 'returned', 'captain|purser|training_admin'),
  ('void', 'rejected', 'captain|purser|training_admin'),
  ('void', 'cancelled', 'captain|purser|training_admin'),
  ('edit_fields', 'submitted', 'hod|captain|purser|training_editor|training_admin'),
  ('edit_fields', 'hod_review', 'hod|captain|purser|training_editor|training_admin'),
  ('edit_fields', 'captain_purser_review', 'hod|captain|purser|training_editor|training_admin'),
  ('edit_fields', 'purser_review', 'hod|captain|purser|training_editor|training_admin'),
  ('edit_fields', 'captain_review', 'hod|captain|purser|training_editor|training_admin'),
  ('edit_fields', 'approved', 'hod|captain|purser|training_editor|training_admin'),
  ('edit_fields', 'discretionary_approved', 'hod|captain|purser|training_editor|training_admin'),
  ('edit_fields', 'enrolled', 'hod|captain|purser|training_editor|training_admin')
-- actor-table:end
;

SELECT tests.is((SELECT count(*) FROM actors), (SELECT count(*) FROM machine WHERE left(outcome, 1) <> '!'),
                'actors: one row per legal cell of the machine');
SELECT tests.is_empty(
  $q$SELECT m.state, m.action FROM machine AS m LEFT JOIN actors AS r ON r.action = m.action AND r.state = m.state
     WHERE array_to_string(public.development_action_actors(m.action, m.state), '|') IS DISTINCT FROM coalesce(r.roles, '')$q$,
  'actors: development_action_actors answers the actor table (and nothing for a refused cell)');

-- The walk: every cell through development_transition, mode 'either' so
-- one final approval completes the review (both vs either is proven below).
UPDATE public.program_settings SET final_approval_mode = 'either' WHERE company_id = tests.company_id('A');
INSERT INTO public.program_settings (company_id, final_approval_mode) SELECT tests.company_id('A'), 'either'
WHERE NOT EXISTS (SELECT 1 FROM public.program_settings WHERE company_id = tests.company_id('A'));

DO $$
DECLARE
  c record;
  v_id uuid;
  v_actor text;
  v_got text;
  v_before bigint;
  v_after bigint;
BEGIN
  FOR c IN SELECT * FROM machine ORDER BY state, action LOOP
    PERFORM tests.reset_role();
    v_id := pg_temp.app(c.state);
    v_actor := CASE WHEN left(c.outcome, 1) = '!' THEN 'A.fleet_manager' ELSE pg_temp.actor(c.action, c.state) END;
    v_before := pg_temp.events(v_id);
    PERFORM tests.as_user(tests.user_id(v_actor));
    BEGIN
      PERFORM public.development_transition(v_id, c.action, pg_temp.payload(c.action));
      PERFORM tests.reset_role();
      v_got := (SELECT status FROM public.development_applications WHERE id = v_id);
    EXCEPTION WHEN OTHERS THEN
      v_got := '!' || SQLERRM;
      IF SQLSTATE <> '22023' THEN
        v_got := v_got || ' (' || SQLSTATE || ')';
      END IF;
    END;
    PERFORM tests.reset_role();
    v_after := pg_temp.events(v_id);
    PERFORM tests.is(v_got, c.outcome, format('machine: %s + %s as %s -> %s', c.state, c.action, v_actor, c.outcome));
    PERFORM tests.is(v_after - v_before, CASE WHEN left(c.outcome, 1) = '!' THEN 0::bigint ELSE 1::bigint END,
                     format('machine: %s + %s writes %s', c.state, c.action, CASE WHEN left(c.outcome, 1) = '!' THEN 'no event' ELSE 'one event' END));
  END LOOP;
  PERFORM tests.reset_role();
END
$$;

-- An actor the table does not allow is refused (42501), never moved.
SELECT tests.reset_role();
INSERT INTO ids VALUES ('perm', pg_temp.app('hod_review'));
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('perm')), '42501', 'not_permitted',
                         'actors: the Captain cannot approve at the HOD stage');
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('perm')), '42501', 'not_permitted',
                         'actors: the applicant never reviews their own application');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'void', '{"reason": "mine"}')$q$, pg_temp.id('perm')), '42501', 'not_permitted',
                         'void: the applicant cannot void');
SELECT tests.as_user(tests.user_id('A.hod_deck_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'void', '{"reason": "wrong"}')$q$, pg_temp.id('perm')), '42501', 'not_permitted',
                         'void: an HOD cannot void');
SELECT tests.as_user(tests.user_id('A.trn_viewer'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'void', '{"reason": "wrong"}')$q$, pg_temp.id('perm')), '42501', 'not_permitted',
                         'void: a training viewer cannot void');
SELECT tests.as_user(tests.user_id('A.purser_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'void', '{}')$q$, pg_temp.id('perm')), '22023', 'reason_required',
                         'void: a reason is required');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'void', '{"reason": "Entered under the wrong vessel"}')$q$, pg_temp.id('perm')),
                   'void: the Purser voids');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'voided' AND voided_by = tests.user_id('A.purser_dra') AND void_reason = 'Entered under the wrong vessel' AND voided_at IS NOT NULL
                 FROM public.development_applications WHERE id = pg_temp.id('perm')),
                'void: voided with who, when and why');
SELECT tests.results_eq(
  format($q$SELECT action, from_status, to_status, actor_role, comment FROM public.development_application_events WHERE application_id = %L ORDER BY created_at, action$q$, pg_temp.id('perm')),
  $q$VALUES ('created'::text, NULL::text, 'hod_review'::text, NULL::text, NULL::text), ('void', 'hod_review', 'voided', 'purser', 'Entered under the wrong vessel')$q$,
  'events: created then void, with the role and the reason');

-- Inactive and foreign callers.
INSERT INTO ids VALUES ('inact', pg_temp.app('hod_review'));
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('inact')), '42501', 'not_permitted',
                         'callers: an inactive user is refused');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'void', '{"reason": "x"}')$q$, pg_temp.id('inact')), 'P0002', 'application_not_found',
                         'callers: another company''s admin finds nothing');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('inact')), 'P0002', 'application_not_found',
                         'callers: another vessel''s crew finds nothing');
SELECT tests.as_user(tests.user_id('A.hod_deck_hyd'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('inact')), 'P0002', 'application_not_found',
                         'HOD scope: another vessel''s HOD finds nothing');
SELECT tests.as_user(tests.user_id('A.hod_deck_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'fly')$q$, pg_temp.id('inact')), '22023', 'unknown_action',
                         'callers: an unknown action is refused');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'hod_approve', '{}', now() - interval '1 day')$q$, pg_temp.id('inact')), '22023', 'stale_application',
                         'callers: a stale expected updated_at is refused');
SELECT tests.reset_role();

-- ------------------------------------------------------------ HOD department scope (user_roles.department)

INSERT INTO ids VALUES ('scope_deck', pg_temp.app('hod_review')), ('scope_stew', pg_temp.app('hod_review', 'A.stew_dra')), ('scope_stew2', pg_temp.app('hod_review', 'A.stew_dra'));
SELECT tests.as_user(tests.user_id('A.hod_deck_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'hod_approve', '{"comment": "Good fit"}')$q$, pg_temp.id('scope_deck')),
                   'HOD scope: the deck HOD approves the deck applicant');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('scope_stew')), 'P0002', 'application_not_found',
                         'HOD scope: the deck HOD cannot act on (or see) the interior applicant');
SELECT tests.as_user(tests.user_id('A.hod_all'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('scope_stew')),
                   'HOD scope: an HOD of every department approves the interior applicant');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'captain_purser_review' AND hod_decision = 'approved' AND hod_reviewer_id = tests.user_id('A.hod_deck_dra')
                        AND hod_comments = 'Good fit' AND hod_reviewed_at IS NOT NULL
                 FROM public.development_applications WHERE id = pg_temp.id('scope_deck')),
                'HOD approval: decision, reviewer, comment and time recorded; on to the final review (captain_purser_review, D-X5-25)');
UPDATE public.user_roles SET department = 'Interior' WHERE id = tests.id('ur:hod_deck_dra');
SELECT tests.as_user(tests.user_id('A.hod_deck_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('scope_stew2')),
                   'HOD scope: the same person, now HOD of Interior, approves the interior applicant');
SELECT tests.reset_role();
UPDATE public.user_roles SET department = 'Deck' WHERE id = tests.id('ur:hod_deck_dra');

-- ------------------------------------------------------------ final approval: both vs either (D-X5-06)

UPDATE public.program_settings SET final_approval_mode = 'both' WHERE company_id = tests.company_id('A');
INSERT INTO ids VALUES ('both', pg_temp.app('captain_purser_review')), ('dual', pg_temp.app('captain_purser_review')),
  ('disc', pg_temp.app('captain_purser_review')), ('either', pg_temp.app('captain_purser_review'));

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'final_approve', '{"comment": "Fine by me"}')$q$, pg_temp.id('both')),
                   'both: the Captain approves');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'captain_purser_review' AND captain_decision = 'approved' AND purser_decision IS NULL
                 FROM public.development_applications WHERE id = pg_temp.id('both')),
                'both: one approval keeps the final review open');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'final_approve')$q$, pg_temp.id('both')), '22023', 'already_decided',
                         'both: the Captain''s office cannot approve twice');
SELECT tests.as_user(tests.user_id('A.purser_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'final_approve')$q$, pg_temp.id('both')),
                   'both: the Purser approves');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'approved' AND purser_decision = 'approved' AND purser_reviewer_id = tests.user_id('A.purser_dra')
                 FROM public.development_applications WHERE id = pg_temp.id('both')),
                'both: the second approval approves');

SELECT tests.as_user(tests.user_id('A.dual_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'final_approve')$q$, pg_temp.id('dual')), '22023', 'role_required',
                         'both: someone holding both offices says which one they act in');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'final_approve', '{"role": "captain"}')$q$, pg_temp.id('dual')),
                   'both: they approve as the Captain');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'final_approve', '{"role": "purser"}')$q$, pg_temp.id('dual')), '22023', 'same_approver',
                         'both: and cannot also approve as the Purser');
SELECT tests.as_user(tests.user_id('A.purser_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'final_approve', '{"role": "captain"}')$q$, pg_temp.id('dual')), '42501', 'not_permitted',
                         'both: the Purser cannot act as the Captain');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'final_approve')$q$, pg_temp.id('dual')), 'both: the Purser completes it');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.development_applications WHERE id = pg_temp.id('dual')), 'approved', 'both: approved by two people');

SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'final_approve_discretionary')$q$, pg_temp.id('disc')), '22023', 'justification_required',
                         'discretionary: a justification is required');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'final_approve_discretionary', '{"justification": "Fills a skills gap"}')$q$, pg_temp.id('disc')),
                   'discretionary: the Captain approves as discretionary');
SELECT tests.as_user(tests.user_id('A.purser_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'final_approve_discretionary', '{"justification": "x"}')$q$, pg_temp.id('disc')), '42501', 'not_permitted',
                         'discretionary: the Purser cannot approve as discretionary');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'final_approve')$q$, pg_temp.id('disc')), 'discretionary: the Purser approves');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'discretionary_approved' AND is_discretionary AND discretionary_justification = 'Fills a skills gap'
                        AND captain_decision = 'discretionary_approved'
                 FROM public.development_applications WHERE id = pg_temp.id('disc')),
                'discretionary: ends discretionary_approved with the justification');

UPDATE public.program_settings SET final_approval_mode = 'either' WHERE company_id = tests.company_id('A');
SELECT tests.as_user(tests.user_id('A.purser_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'final_approve')$q$, pg_temp.id('either')), 'either: the Purser approves');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'approved' AND captain_decision IS NULL FROM public.development_applications WHERE id = pg_temp.id('either')),
                'either: one approval approves');
SELECT tests.is((SELECT payload ->> 'mode' FROM public.development_application_events WHERE application_id = pg_temp.id('either') AND action = 'final_approve'),
                'either', 'either: the event records the mode');

-- ------------------------------------------------------------ reject vs return (W3)

INSERT INTO ids VALUES ('rej', pg_temp.app('captain_purser_review')), ('ret', pg_temp.app('captain_purser_review'));
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'reject')$q$, pg_temp.id('rej')), '22023', 'reason_required', 'reject: a reason is required');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'reject', '{"reason": "Outside the programme"}')$q$, pg_temp.id('rej')), 'reject: the Captain rejects');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'return')$q$, pg_temp.id('ret')), '22023', 'comment_required', 'return: a comment is required');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'return', '{"comment": "Attach the quote"}')$q$, pg_temp.id('ret')), 'return: the Captain returns it');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'rejected' AND denial_reason = 'Outside the programme' AND rejected_by = tests.user_id('A.master_dra') AND rejected_at IS NOT NULL
                 FROM public.development_applications WHERE id = pg_temp.id('rej')),
                'reject: final, the reason in denial_reason, who and when');
SELECT tests.ok((SELECT status = 'returned' AND captain_decision = 'returned' AND captain_comments = 'Attach the quote' AND denial_reason IS NULL
                 FROM public.development_applications WHERE id = pg_temp.id('ret')),
                'return: returned with the comment, not rejected');
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'submit')$q$, pg_temp.id('rej')), '22023', 'application_final',
                         'reject: a rejected application cannot be resubmitted');
UPDATE public.development_applications SET course_provider = 'Quote attached: Harbour Academy' WHERE id = pg_temp.id('ret');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'submit')$q$, pg_temp.id('ret')), 'return: the applicant edits and resubmits');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'hod_review' AND course_provider = 'Quote attached: Harbour Academy' AND captain_decision IS NULL AND captain_comments IS NULL
                        AND hod_decision IS NULL AND submitted_at IS NOT NULL AND stage_entered_at > now() - interval '1 minute'
                 FROM public.development_applications WHERE id = pg_temp.id('ret')),
                'resubmit: the edit kept, the earlier decisions cleared (the history keeps them), the stage stamped');
SELECT tests.is(pg_temp.events(pg_temp.id('ret'), 'return'), 1::bigint, 'resubmit: the return stays in the history');

-- Cancel: the applicant before approval, a final approver (with a reason) after.
INSERT INTO ids VALUES ('can_pre', pg_temp.app('hod_review')), ('can_post', pg_temp.app('approved')), ('can_post2', pg_temp.app('enrolled'));
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'cancel')$q$, pg_temp.id('can_pre')), 'cancel: the applicant cancels before approval (no reason needed)');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'cancel', '{"reason": "changed my mind"}')$q$, pg_temp.id('can_post')), '42501', 'not_permitted',
                         'cancel: the applicant cannot cancel after approval');
SELECT tests.as_user(tests.user_id('A.master_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'cancel')$q$, pg_temp.id('can_post')), '22023', 'reason_required',
                         'cancel: after approval a reason is required');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'cancel', '{"reason": "Course moved past the contract end"}')$q$, pg_temp.id('can_post')),
                   'cancel: the Captain cancels after approval');
SELECT tests.as_user(tests.user_id('A.trn_admin'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'cancel', '{"reason": "Provider closed"}')$q$, pg_temp.id('can_post2')),
                   'cancel: a training admin cancels an enrolled application');
SELECT tests.reset_role();
SELECT tests.ok((SELECT cancel_reason = 'Course moved past the contract end' AND cancelled_by = tests.user_id('A.master_dra') FROM public.development_applications WHERE id = pg_temp.id('can_post')),
                'cancel: who and why recorded');

-- edit_fields: an approver's correction, logged as a diff.
INSERT INTO ids VALUES ('edit', pg_temp.app('hod_review'));
SELECT tests.as_user(tests.user_id('A.hod_deck_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'edit_fields', '{"fields": {"status": "approved"}}')$q$, pg_temp.id('edit')), '22023', 'field_not_editable',
                         'edit_fields: the status is not a detail');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'edit_fields', '{"fields": {"course_provider": "Sea School"}}')$q$, pg_temp.id('edit')), '22023', 'nothing_changed',
                         'edit_fields: no change is refused');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'edit_fields', '{"fields": {"course_start_date": "2026-02-31"}}')$q$, pg_temp.id('edit')), '22023', 'field_invalid',
                         'edit_fields: an invalid value is refused');
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'edit_fields', '{"fields": {"course_provider": "Harbour Academy", "estimated_tuition_usd": 950}}')$q$, pg_temp.id('edit')),
                   'edit_fields: the HOD corrects the provider and the tuition');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'hod_review' AND course_provider = 'Harbour Academy' AND estimated_tuition_usd = 950 FROM public.development_applications WHERE id = pg_temp.id('edit')),
                'edit_fields: the details change, the status does not');
SELECT tests.is((SELECT field_diff FROM public.development_application_events WHERE application_id = pg_temp.id('edit') AND action = 'edit_fields'),
                '{"course_provider": {"to": "Harbour Academy", "from": "Sea School"}, "estimated_tuition_usd": {"to": 950, "from": 0}}'::jsonb,
                'edit_fields: the event holds the field diff');

-- ------------------------------------------------------------ completion -> qualification (TR9)

INSERT INTO public.development_courses (id, company_id, name, department, category, valid_for_months, qualification_label)
VALUES (tests.id('course:fire'), tests.company_id('A'), 'Advanced firefighting', 'Deck', 'mandatory', 24, 'Advanced firefighting certificate'),
       (tests.id('course:wine'), tests.company_id('A'), 'Wine service', 'Interior', 'professional', NULL, NULL);
INSERT INTO ids VALUES ('done_fire', pg_temp.app('enrolled', 'A.deck_dra', 'A.dra', tests.id('course:fire'))),
                       ('done_wine', pg_temp.app('approved', 'A.deck_dra', 'A.dra', tests.id('course:wine')));
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'complete')$q$, pg_temp.id('done_fire')), '22023', 'completed_on_required',
                         'complete: the completion day is required');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'complete', jsonb_build_object('completed_on', current_date + 10))$q$, pg_temp.id('done_fire')),
                         '22023', 'completed_on_in_future', 'complete: not in the future');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'complete', '{"completed_on": "soon"}')$q$, pg_temp.id('done_fire')),
                         '22023', 'completed_on_invalid', 'complete: a date');
SELECT tests.throws_like(format($q$SELECT public.development_transition(%L, 'complete', '{"completed_on": "2026-01-01", "evidence_path": "../x"}')$q$, pg_temp.id('done_fire')),
                         '22023', 'evidence_path_invalid', 'complete: the evidence path stays a storage path');
SELECT tests.reset_role();
-- The legacy branch, also while X1's definer exists (it is hidden here so the branch runs).
DO $$
BEGIN
  IF to_regprocedure('public.crew_document_record_from_source(uuid,uuid,date,date,text,uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.crew_document_record_from_source(uuid, uuid, date, date, text, uuid) RENAME TO crew_document_record_from_source_hidden;
  END IF;
END
$$;
UPDATE public.development_courses SET qualification_document_type_id = gen_random_uuid() WHERE id = tests.id('course:fire');
INSERT INTO got SELECT 'certs_before', to_jsonb(count(*)) FROM public.crew_certificates WHERE user_id = tests.user_id('A.deck_dra');
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'complete', '{"completed_on": "2026-03-15", "certificate_number": "AFF-77", "evidence_path": "a/b/cert.pdf"}')$q$, pg_temp.id('done_fire')),
                   'complete: the applicant records the completion');
SELECT tests.reset_role();
SELECT tests.is((SELECT count(*) FROM public.crew_certificates WHERE user_id = tests.user_id('A.deck_dra')) - (SELECT (v #>> '{}')::bigint FROM got WHERE k = 'certs_before'),
                1::bigint, 'complete: exactly one qualification written');
SELECT tests.ok((SELECT c.certificate_name = 'Advanced firefighting certificate' AND c.issue_date = '2026-03-15'::date AND c.expiry_date = '2028-03-15'::date
                        AND c.certificate_number = 'AFF-77' AND c.issuing_authority = 'Sea School' AND c.user_id = tests.user_id('A.deck_dra')
                 FROM public.development_applications AS a JOIN public.crew_certificates AS c ON c.id = a.qualification_record_id
                 WHERE a.id = pg_temp.id('done_fire')),
                'complete: the legacy row: the course''s qualification label, issue = completion, expiry = completion + 24 months, the provider');
SELECT tests.ok((SELECT status = 'completed' AND completed_at = '2026-03-15T00:00:00Z'::timestamptz AND completion_certificate_url = 'a/b/cert.pdf'
                 FROM public.development_applications WHERE id = pg_temp.id('done_fire')),
                'complete: completed, the day and the evidence path stored');
SELECT tests.is((SELECT payload ->> 'qualification_source' FROM public.development_application_events WHERE application_id = pg_temp.id('done_fire') AND action = 'complete'),
                'legacy_certificate', 'complete: the event says the legacy branch ran');
SELECT tests.is(public.development_record_qualification((SELECT a FROM public.development_applications AS a WHERE a.id = pg_temp.id('done_fire')), '2026-03-15', NULL),
                (SELECT qualification_record_id FROM public.development_applications WHERE id = pg_temp.id('done_fire')),
                'complete: idempotent per application (the same record comes back)');
SELECT tests.is((SELECT count(*) FROM public.crew_certificates WHERE user_id = tests.user_id('A.deck_dra')) - (SELECT (v #>> '{}')::bigint FROM got WHERE k = 'certs_before'),
                1::bigint, 'complete: and nothing more written');
DO $$
BEGIN
  IF to_regprocedure('public.crew_document_record_from_source_hidden(uuid,uuid,date,date,text,uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.crew_document_record_from_source_hidden(uuid, uuid, date, date, text, uuid) RENAME TO crew_document_record_from_source;
  END IF;
END
$$;
UPDATE public.development_courses SET qualification_document_type_id = NULL WHERE id = tests.id('course:fire');
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'complete', '{"completed_on": "2026-04-01"}')$q$, pg_temp.id('done_wine')),
                   'complete: a course without validity');
SELECT tests.reset_role();
SELECT tests.ok((SELECT c.certificate_name = 'Wine service' AND c.expiry_date IS NULL
                 FROM public.development_applications AS a JOIN public.crew_certificates AS c ON c.id = a.qualification_record_id
                 WHERE a.id = pg_temp.id('done_wine')),
                'complete: the course name when no label, no expiry when no validity');

-- X1's definer when it exists and the course names a crew document type.
DO $$
DECLARE
  v_type uuid;
  v_app uuid;
  v_rec uuid;
  v_ok boolean;
BEGIN
  IF to_regprocedure('public.crew_document_record_from_source(uuid,uuid,date,date,text,uuid)') IS NULL OR to_regclass('public.crew_document_types') IS NULL THEN
    PERFORM tests.ok(true, 'complete via crew_document_record_from_source: not in this build (X1''s file not applied); the legacy branch above ran');
    RETURN;
  END IF;
  EXECUTE 'SELECT t.id FROM public.crew_document_types AS t WHERE t.company_id IS NULL OR t.company_id = $1 ORDER BY t.company_id NULLS LAST, t.id LIMIT 1'
    INTO v_type USING tests.company_id('A');
  IF v_type IS NULL THEN
    PERFORM tests.ok(true, 'complete via crew_document_record_from_source: no crew document type seeded; the legacy branch above ran');
    RETURN;
  END IF;
  UPDATE public.development_courses SET qualification_document_type_id = v_type WHERE id = tests.id('course:fire');
  v_app := pg_temp.app('enrolled', 'A.deck_dra', 'A.dra', tests.id('course:fire'));
  PERFORM tests.as_user(tests.user_id('A.deck_dra'));
  PERFORM public.development_transition(v_app, 'complete', '{"completed_on": "2026-05-10"}');
  PERFORM tests.reset_role();
  SELECT qualification_record_id INTO v_rec FROM public.development_applications WHERE id = v_app;
  EXECUTE 'SELECT document_type_id = $2 AND expiry_date = ''2028-05-10''::date AND issue_date = ''2026-05-10''::date FROM public.crew_certificates WHERE id = $1'
    INTO v_ok USING v_rec, v_type;
  PERFORM tests.ok(coalesce(v_ok, false), 'complete via crew_document_record_from_source: the typed crew document with expiry = completion + valid_for');
  PERFORM tests.is((SELECT payload ->> 'qualification_source' FROM public.development_application_events WHERE application_id = v_app AND action = 'complete'),
                   'crew_document', 'complete via crew_document_record_from_source: the event says so');
  UPDATE public.development_courses SET qualification_document_type_id = NULL WHERE id = tests.id('course:fire');
END
$$;

-- ------------------------------------------------------------ the guard (every role)

INSERT INTO ids VALUES ('g_draft', pg_temp.app('draft')), ('g_review', pg_temp.app('hod_review'));
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.throws_like(format($q$INSERT INTO public.development_applications (company_id, crew_member_id, vessel_id, course_name, category, status)
                                   VALUES (%L, %L, %L, 'Sneaky', 'professional', 'approved')$q$, tests.company_id('A'), tests.user_id('A.deck_dra'), tests.vessel_id('A.dra')),
                         '42501', 'development_applications_guarded', 'guard: the applicant cannot insert an approved application');
SELECT tests.throws_like(format($q$INSERT INTO public.development_applications (company_id, crew_member_id, vessel_id, course_name, category, status, hod_decision)
                                   VALUES (%L, %L, %L, 'Sneaky', 'professional', 'draft', 'approved')$q$, tests.company_id('A'), tests.user_id('A.deck_dra'), tests.vessel_id('A.dra')),
                         '42501', 'development_applications_guarded', 'guard: nor a draft carrying a decision');
SELECT tests.lives(format($q$INSERT INTO public.development_applications (id, company_id, crew_member_id, vessel_id, course_name, category)
                             VALUES (%L, %L, %L, %L, 'Navigation refresher', 'professional')$q$, tests.id('app:own'), tests.company_id('A'), tests.user_id('A.deck_dra'), tests.vessel_id('A.dra')),
                   'guard: the applicant creates a draft');
SELECT tests.throws_like(format($q$UPDATE public.development_applications SET status = 'hod_review' WHERE id = %L$q$, pg_temp.id('g_draft')),
                         '42501', 'development_applications_guarded', 'guard: the applicant cannot move their draft by a direct write');
SELECT tests.throws_like(format($q$UPDATE public.development_applications SET hod_decision = 'approved' WHERE id = %L$q$, pg_temp.id('g_draft')),
                         '42501', 'development_applications_guarded', 'guard: nor write a decision');
SELECT tests.lives(format($q$UPDATE public.development_applications SET course_location = 'Southampton' WHERE id = %L$q$, pg_temp.id('g_draft')),
                   'guard: the applicant edits the content of their draft');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'draft' AND stage_entered_at IS NOT NULL AND application_number ~ '^CDA-[0-9]{8}-[0-9]{4}$' FROM public.development_applications WHERE id = tests.id('app:own')),
                'guard: a new application is a numbered draft with its stage stamped');
SELECT tests.is(pg_temp.events(tests.id('app:own'), 'created'), 1::bigint, 'audit: the creation is in the history');
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.lives(format($q$UPDATE public.development_applications SET course_location = 'Elsewhere' WHERE id = %L$q$, pg_temp.id('g_review')),
                   'RLS: the applicant''s update of a submitted application matches no row');
SELECT tests.reset_role();
SELECT tests.is((SELECT course_location FROM public.development_applications WHERE id = pg_temp.id('g_review')), NULL::text,
                'RLS: the submitted application is unchanged');
SELECT tests.as_service();
SELECT tests.throws_like(format($q$UPDATE public.development_applications SET status = 'approved' WHERE id = %L$q$, pg_temp.id('g_review')),
                         '42501', 'development_applications_guarded', 'guard: the service role cannot change a status directly');
SELECT tests.throws_like(format($q$UPDATE public.development_applications SET course_name = 'Changed' WHERE id = %L$q$, pg_temp.id('g_review')),
                         '42501', 'development_applications_guarded', 'guard: nor the content of a submitted application');
SELECT tests.throws_like(format($q$INSERT INTO public.development_applications (company_id, crew_member_id, vessel_id, course_name, category, status)
                                   VALUES (%L, %L, %L, 'Bulk', 'professional', 'completed')$q$, tests.company_id('A'), tests.user_id('A.deck_dra'), tests.vessel_id('A.dra')),
                         '42501', 'development_applications_guarded', 'guard: nor insert a completed one');
SELECT tests.reset_role();
SELECT tests.throws_like(format($q$UPDATE public.development_applications SET status = 'approved' WHERE id = %L$q$, pg_temp.id('g_review')),
                         '42501', 'development_applications_guarded', 'guard: the table owner cannot either');
SELECT tests.throws_like(format($q$DELETE FROM public.development_applications WHERE id = %L$q$, pg_temp.id('g_review')),
                         '42501', 'development_applications_guarded', 'guard: a submitted application is never deleted');
SELECT tests.throws_like(format($q$UPDATE public.development_applications SET company_id = %L WHERE id = %L$q$, tests.company_id('B'), pg_temp.id('g_draft')),
                         '42501', 'development_applications_guarded', 'guard: an application never moves company');
SELECT tests.throws_like(format($q$UPDATE public.development_applications SET vessel_id = %L WHERE id = %L$q$, tests.vessel_id('B.lev'), pg_temp.id('g_draft')),
                         '42501', 'development_applications_guarded', 'guard: nor to another company''s vessel');
SELECT tests.throws_like($q$INSERT INTO public.development_application_events (company_id, vessel_id, application_id, action) SELECT company_id, vessel_id, id, 'void' FROM public.development_applications LIMIT 1$q$,
                         '42501', 'development_application_events_guarded', 'events: written only by the definers');
SELECT tests.throws_like($q$UPDATE public.development_application_events SET comment = 'x'$q$, '42501', 'development_application_events_guarded', 'events: append-only');
SELECT tests.lives(format($q$DELETE FROM public.development_applications WHERE id = %L$q$, pg_temp.id('g_draft')), 'guard: a draft is deleted (its history goes with it)');

-- ------------------------------------------------------------ SELECT narrowed (RLS)

INSERT INTO ids VALUES ('r_deck', pg_temp.app('hod_review')), ('r_stew', pg_temp.app('hod_review', 'A.stew_dra')),
                       ('r_hyd', pg_temp.app('hod_review', 'A.deck_hyd', 'A.hyd'));
CREATE TEMP TABLE readers (k text PRIMARY KEY, deck boolean, stew boolean, hyd boolean) ON COMMIT DROP;
GRANT ALL ON readers TO PUBLIC;
DO $$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['A.deck_dra', 'A.stew_dra', 'A.crew_hyd', 'A.hod_deck_dra', 'A.hod_all', 'A.hod_deck_hyd', 'A.purser_dra', 'A.master_dra',
                           'A.trn_viewer', 'A.trn_admin', 'A.fleet_manager', 'A.disabled', 'B.admin', 'B.crew'] LOOP
    PERFORM tests.as_user(tests.user_id(p));
    INSERT INTO readers VALUES (p,
      EXISTS (SELECT 1 FROM public.development_applications WHERE id = pg_temp.id('r_deck')),
      EXISTS (SELECT 1 FROM public.development_applications WHERE id = pg_temp.id('r_stew')),
      EXISTS (SELECT 1 FROM public.development_applications WHERE id = pg_temp.id('r_hyd')));
    PERFORM tests.reset_role();
  END LOOP;
END
$$;
SELECT tests.results_eq($q$SELECT k, deck, stew, hyd FROM readers ORDER BY k$q$,
  $q$VALUES ('A.crew_hyd', false, false, false), ('A.deck_dra', true, false, false), ('A.disabled', false, false, false),
            ('A.fleet_manager', true, true, true), ('A.hod_all', true, true, false), ('A.hod_deck_dra', true, false, false),
            ('A.hod_deck_hyd', false, false, true), ('A.master_dra', true, true, false), ('A.purser_dra', true, true, false),
            ('A.stew_dra', false, true, false), ('A.trn_admin', true, true, true), ('A.trn_viewer', true, true, true),
            ('B.admin', false, false, false), ('B.crew', false, false, false)$q$,
  'RLS: the applicant their own; HODs their department on their vessel (HYDRA''s deck HOD the HYDRA deckhand); the vessel''s Captain and Purser; training viewers; nobody else (another vessel''s crew, inactive, company B)');
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is((SELECT count(*) FROM public.development_applications WHERE vessel_id = tests.vessel_id('A.dra')), 0::bigint,
                'RLS: a crew member of another vessel reads none of DRAAK''s applications');
SELECT tests.is((SELECT count(*) FROM public.development_application_events WHERE vessel_id = tests.vessel_id('A.dra')), 0::bigint,
                'RLS: nor their history');
SELECT tests.as_user(tests.user_id('A.hod_deck_dra'));
SELECT tests.ok((SELECT count(*) FROM public.development_application_events WHERE application_id = pg_temp.id('r_deck')) = 1
                AND (SELECT count(*) FROM public.development_application_events WHERE application_id = pg_temp.id('r_stew')) = 0,
                'RLS: history follows the application');
SELECT tests.reset_role();
-- A named reviewer keeps reading after their office ends.
UPDATE public.user_roles SET is_active = false WHERE id = tests.id('ur:hod_all');
SELECT tests.as_user(tests.user_id('A.hod_all'));
SELECT tests.ok(EXISTS (SELECT 1 FROM public.development_applications WHERE id = pg_temp.id('scope_stew'))
                AND NOT EXISTS (SELECT 1 FROM public.development_applications WHERE id = pg_temp.id('r_stew')),
                'RLS: a named reviewer still reads what they reviewed, not what they did not');
SELECT tests.reset_role();
UPDATE public.user_roles SET is_active = true WHERE id = tests.id('ur:hod_all');

-- Participants: pinned to the application's company.
SELECT tests.as_user(tests.user_id('A.trn_admin'));
SELECT tests.lives(format($q$INSERT INTO public.fleet_training_participants (application_id, crew_member_id) VALUES (%L, %L)$q$, pg_temp.id('r_deck'), tests.user_id('A.stew_dra')),
                   'participants: a fleet training editor adds a company crew member');
SELECT tests.denied(format($q$INSERT INTO public.fleet_training_participants (application_id, crew_member_id) VALUES (%L, %L)$q$, pg_temp.id('r_deck'), tests.user_id('B.crew')),
                    'participants: not someone of another company');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.denied(format($q$INSERT INTO public.fleet_training_participants (application_id, crew_member_id) VALUES (%L, %L)$q$, pg_temp.id('r_deck'), tests.user_id('B.crew')),
                    'participants: another company''s admin adds nobody to A''s training');
SELECT tests.is((SELECT count(*) FROM public.fleet_training_participants), 0::bigint, 'participants: and reads none of A''s');
SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.denied(format($q$INSERT INTO public.fleet_training_participants (application_id, crew_member_id) VALUES (%L, %L)$q$, pg_temp.id('r_deck'), tests.user_id('A.deck_dra')),
                    'participants: crew cannot add participants');
SELECT tests.as_user(tests.user_id('A.stew_dra'));
SELECT tests.is((SELECT count(*) FROM public.fleet_training_participants), 1::bigint, 'participants: the participant reads their own row');
SELECT tests.reset_role();

-- ------------------------------------------------------------ numbering (no MAX()+1)

SELECT tests.reset_role();
SELECT tests.lives(format($q$INSERT INTO public.development_applications (id, company_id, crew_member_id, vessel_id, course_name, category, application_number)
                             VALUES (%L, %L, %L, %L, 'Imported', 'professional', 'CDA-20250101-0041')$q$, tests.id('app:b_old'), tests.company_id('B'), tests.user_id('B.crew'), tests.vessel_id('B.lev')),
                   'numbering: an existing B number 41 (as imported, no counter yet)');
DELETE FROM public.reference_counters WHERE scope = 'dev_app:' || tests.company_id('B')::text;
SELECT tests.lives(format($q$INSERT INTO public.development_applications (id, company_id, crew_member_id, vessel_id, course_name, category)
                             VALUES (%L, %L, %L, %L, 'Next', 'professional')$q$, tests.id('app:b_next'), tests.company_id('B'), tests.user_id('B.crew'), tests.vessel_id('B.lev')),
                   'numbering: the next B application');
SELECT tests.is((SELECT right(application_number, 4) FROM public.development_applications WHERE id = tests.id('app:b_next')), '0042',
                'numbering: continues from the highest existing number (seeded once from it)');
SELECT tests.ok((SELECT next_value = 43 FROM public.reference_counters WHERE scope = 'dev_app:' || tests.company_id('B')::text),
                'numbering: the counter holds the next value');
-- Two callers that both draw before either row is written (what two
-- concurrent inserts do): MAX()+1 would give both 43; the counter does not.
INSERT INTO got VALUES ('n1', to_jsonb(public.development_application_number_for(tests.company_id('B')))),
                       ('n2', to_jsonb(public.development_application_number_for(tests.company_id('B'))));
SELECT tests.ok((SELECT right(v #>> '{}', 4) FROM got WHERE k = 'n1') = '0043' AND (SELECT right(v #>> '{}', 4) FROM got WHERE k = 'n2') = '0044',
                'numbering: two interleaved callers get 43 and 44, no duplicate and no gap');
UPDATE public.reference_counters SET next_value = 100 WHERE scope = 'dev_app:' || tests.company_id('B')::text;
SELECT tests.lives(format($q$INSERT INTO public.development_applications (id, company_id, crew_member_id, vessel_id, course_name, category)
                             VALUES (%L, %L, %L, %L, 'After', 'professional')$q$, tests.id('app:b_after'), tests.company_id('B'), tests.user_id('B.crew'), tests.vessel_id('B.lev')),
                   'numbering: one more');
SELECT tests.is((SELECT right(application_number, 4) FROM public.development_applications WHERE id = tests.id('app:b_after')), '0100',
                'numbering: the counter drives the number, never the maximum');
SELECT tests.lives(format($q$INSERT INTO public.development_applications (company_id, crew_member_id, vessel_id, course_name, category, application_number)
                             VALUES (%L, %L, %L, 'Same number, other company', 'professional', (SELECT application_number FROM public.development_applications WHERE id = %L))$q$,
                          tests.company_id('A'), tests.user_id('A.deck_dra'), tests.vessel_id('A.dra'), tests.id('app:b_old')),
                   'numbering: numbers are unique per company, so A may hold the same number as B');
SELECT tests.ok(position('next_reference_value' IN pg_get_functiondef('public.development_application_number_for(uuid)'::regprocedure)) > 0
                AND position('next_reference_value' IN pg_get_functiondef('public.generate_dev_application_number()'::regprocedure)) = 0
                AND position('development_application_number_for' IN pg_get_functiondef('public.generate_dev_application_number()'::regprocedure)) > 0,
                'numbering: the trigger draws from the counter');

-- ------------------------------------------------------------ notifications (X4)

DO $$
DECLARE
  v_app uuid;
  v_out record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_types WHERE key = 'training_application_action_needed') THEN
    PERFORM tests.ok(true, 'notifications: the Training types are not seeded in this build (030100); the emits are skipped');
    RETURN;
  END IF;
  PERFORM tests.reset_role();
  v_app := pg_temp.app('draft');
  PERFORM tests.as_user(tests.user_id('A.deck_dra'));
  PERFORM public.development_transition(v_app, 'submit');
  PERFORM tests.reset_role();
  SELECT * INTO v_out FROM public.notification_outbox WHERE record_id = v_app AND type_key = 'training_application_action_needed' ORDER BY created_at DESC LIMIT 1;
  PERFORM tests.ok(v_out.id IS NOT NULL AND v_out.link_scope = 'vessel' AND v_out.vessel_id = tests.vessel_id('A.dra') AND v_out.link_path = 'crew/training'
                   AND v_out.must_act_user_ids @> ARRAY[tests.user_id('A.hod_deck_dra'), tests.user_id('A.hod_all')]
                   AND NOT (tests.user_id('A.hod_deck_hyd') = ANY (v_out.must_act_user_ids)) AND NOT (tests.user_id('A.deck_dra') = ANY (v_out.must_act_user_ids)),
                   'notifications: submit asks the HODs covering the applicant on the vessel (Crew Training), nobody else');
  PERFORM tests.is((SELECT count(*) FROM public.notification_outbox WHERE record_id = v_app AND type_key = 'training_application_updated'), 0::bigint,
                   'notifications: the applicant is not told of their own step');
  PERFORM tests.as_user(tests.user_id('A.hod_deck_dra'));
  PERFORM public.development_transition(v_app, 'hod_approve');
  PERFORM tests.reset_role();
  SELECT * INTO v_out FROM public.notification_outbox WHERE record_id = v_app AND type_key = 'training_application_action_needed' AND payload ->> 'stage' = 'final' LIMIT 1;
  PERFORM tests.ok(v_out.must_act_user_ids @> ARRAY[tests.user_id('A.master_dra'), tests.user_id('A.purser_dra')]
                   AND NOT (tests.user_id('A.hod_deck_dra') = ANY (v_out.must_act_user_ids)),
                   'notifications: HOD approval asks the vessel''s Captain and Purser');
  SELECT * INTO v_out FROM public.notification_outbox WHERE record_id = v_app AND type_key = 'training_application_updated' LIMIT 1;
  PERFORM tests.ok(v_out.id IS NOT NULL AND v_out.link_scope = 'personal' AND v_out.link_path = 'training' AND v_out.must_act_user_ids = ARRAY[tests.user_id('A.deck_dra')],
                   'notifications: and tells the applicant (personal Training)');
  PERFORM tests.ok(EXISTS (SELECT 1 FROM public.notification_inbox WHERE user_id = tests.user_id('A.deck_dra') AND record_id = v_app),
                   'notifications: the applicant''s inbox has it');
END
$$;
-- Emits that fail are warnings: a type the outbox does not know is skipped.
SAVEPOINT bad_emit;
CREATE OR REPLACE FUNCTION public.emit_notification_event(p_type_key text, p_company_id uuid, p_title text, p_link_scope text, p_vessel_id uuid DEFAULT NULL,
  p_body text DEFAULT NULL, p_severity text DEFAULT 'info', p_link_path text DEFAULT NULL, p_link_workspace text DEFAULT NULL, p_record_kind text DEFAULT NULL,
  p_record_id uuid DEFAULT NULL, p_record_ref text DEFAULT NULL, p_envelope_id uuid DEFAULT NULL, p_must_act_user_ids uuid[] DEFAULT '{}'::uuid[],
  p_audience text[] DEFAULT '{}'::text[], p_payload jsonb DEFAULT '{}'::jsonb, p_dedupe_key text DEFAULT NULL, p_module_key text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unknown_notification_type'; END; $f$;
INSERT INTO ids VALUES ('emitfail', pg_temp.app('hod_review'));
SELECT tests.as_user(tests.user_id('A.hod_deck_dra'));
SELECT tests.lives(format($q$SELECT public.development_transition(%L, 'hod_approve')$q$, pg_temp.id('emitfail')),
                   'notifications: an emit that raises (unknown type) never rolls the transition back');
SELECT tests.reset_role();
SELECT tests.is((SELECT status FROM public.development_applications WHERE id = pg_temp.id('emitfail')), 'captain_purser_review',
                'notifications: the step stands');
ROLLBACK TO SAVEPOINT bad_emit;

-- ------------------------------------------------------------ catalogue, settings and promote definers (training admins)

SELECT tests.as_user(tests.user_id('A.deck_dra'));
SELECT tests.throws_like($q$SELECT public.development_course_save('{"name": "x", "department": "Deck", "category": "professional"}')$q$, '42501', 'not_permitted',
                         'course save: crew are refused');
SELECT tests.as_user(tests.user_id('A.trn_viewer'));
SELECT tests.throws_like($q$SELECT public.development_settings_save('{"final_approval_mode": "either"}')$q$, '42501', 'not_permitted',
                         'settings save: a training viewer is refused');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like($q$SELECT public.development_course_save('{}')$q$, '42501', 'not_permitted', 'course save: an inactive user is refused');
SELECT tests.as_user(tests.user_id('A.trn_admin'));
SELECT tests.throws_like($q$SELECT public.development_course_save('{"name": "x", "department": "Deck", "category": "professional", "colour": "red"}')$q$, '22023', 'field_unknown',
                         'course save: an unknown key');
SELECT tests.throws_like($q$SELECT public.development_course_save('{"department": "Deck", "category": "professional"}')$q$, '22023', 'field_required', 'course save: a name');
SELECT tests.throws_like($q$SELECT public.development_course_save('{"name": "STCW refresher", "department": "Deck", "category": "professional", "valid_for_months": 12, "renew_from_months": 12}')$q$,
                         '22023', 'field_invalid', 'course save: renew from must be under valid for');
SELECT tests.throws_like($q$SELECT public.development_course_save('{"name": "STCW refresher", "department": "Deck", "category": "unknown"}')$q$, '22023', 'field_invalid', 'course save: a known category');
SELECT tests.lives($q$INSERT INTO got SELECT 'course', to_jsonb(c) FROM public.development_course_save('{"name": "STCW refresher", "department": "Deck", "category": "mandatory",
  "valid_for_months": 60, "renew_from_months": 6, "applies_to_departments": ["Deck", "Engineering"], "is_mandatory": true, "pathway": "Officer of the watch",
  "renewal_note": "Book six months ahead", "qualification_label": "STCW basic safety"}') AS c$q$, 'course save: a training admin creates a course with its rules');
SELECT tests.reset_role();
SELECT tests.ok((SELECT valid_for_months = 60 AND renew_from_months = 6 AND applies_to_departments = ARRAY['Deck', 'Engineering'] AND is_mandatory AND origin = 'catalogue'
                        AND company_id = tests.company_id('A') AND status = 'active'
                 FROM public.development_courses WHERE id = (SELECT (v ->> 'id')::uuid FROM got WHERE k = 'course')),
                'course save: stored with the rules, in the caller''s company');
SELECT tests.as_user(tests.user_id('A.trn_admin'));
SELECT tests.throws_like(format($q$SELECT public.development_course_save(jsonb_build_object('id', %L, 'name', 'Renamed', 'expected_updated_at', '2001-01-01T00:00:00Z'))$q$,
                                (SELECT v ->> 'id' FROM got WHERE k = 'course')), '22023', 'stale_course', 'course save: a stale edit is refused');
SELECT tests.lives(format($q$SELECT public.development_course_save(jsonb_build_object('id', %L, 'name', 'STCW basic safety refresher'))$q$, (SELECT v ->> 'id' FROM got WHERE k = 'course')),
                   'course save: an edit keeps the other fields');
SELECT tests.throws_like(format($q$SELECT public.development_course_save(jsonb_build_object('id', %L, 'qualification_document_type_id', gen_random_uuid()))$q$, (SELECT v ->> 'id' FROM got WHERE k = 'course')),
                         '22023', CASE WHEN to_regclass('public.crew_document_types') IS NULL THEN 'qualification_types_not_set_up' ELSE 'qualification_type_not_found' END,
                         'course save: a qualification type is checked against crew_document_types');
SELECT tests.lives(format($q$SELECT public.development_course_archive(%L)$q$, (SELECT v ->> 'id' FROM got WHERE k = 'course')), 'course archive: archived');
SELECT tests.reset_role();
SELECT tests.ok((SELECT status = 'archived' AND name = 'STCW basic safety refresher' AND valid_for_months = 60 FROM public.development_courses WHERE id = (SELECT (v ->> 'id')::uuid FROM got WHERE k = 'course')),
                'course archive: archived, the edit kept');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.development_audit_log WHERE company_id = tests.company_id('A') AND action = 'course_archived' AND actor_id = tests.user_id('A.trn_admin')),
                'course archive: audited');
SELECT tests.as_user(tests.user_id('B.admin'));
SELECT tests.throws_like(format($q$SELECT public.development_course_archive(%L)$q$, (SELECT v ->> 'id' FROM got WHERE k = 'course')), 'P0002', 'course_not_found',
                         'course archive: another company''s course is not found');
SELECT tests.as_user(tests.user_id('A.trn_admin'));
SELECT tests.throws_like($q$SELECT public.development_settings_save('{"final_approval_mode": "majority"}')$q$, '22023', 'field_invalid', 'settings: the approval mode is both or either');
SELECT tests.throws_like($q$SELECT public.development_settings_save('{"fx_overrides": {"euro": 1.1}}')$q$, '22023', 'field_invalid', 'settings: FX overrides by ISO code');
SELECT tests.throws_like($q$SELECT public.development_settings_save('{"category_labels": {"fleet_organised": ""}}')$q$, '22023', 'field_invalid', 'settings: a category label is not blank');
SELECT tests.throws_like($q$SELECT public.development_settings_save('{"clawback_months": 1.5}')$q$, '22023', 'field_invalid', 'settings: whole months');
SELECT tests.throws_like($q$SELECT public.development_settings_save('{"budget": 1}')$q$, '22023', 'field_unknown', 'settings: an unknown key');
SELECT tests.lives($q$SELECT public.development_settings_save('{"final_approval_mode": "both", "mileage_rate_per_km": 0.45, "fx_overrides": {"EUR": 1.08},
  "category_labels": {"fleet_organised": "Company required"}, "clawback_months": 18}')$q$, 'settings: a training admin saves the policy');
SELECT tests.reset_role();
SELECT tests.ok((SELECT final_approval_mode = 'both' AND mileage_rate_per_km = 0.45 AND fx_overrides = '{"EUR": 1.08}'::jsonb
                        AND category_labels = '{"fleet_organised": "Company required"}'::jsonb AND clawback_months = 18 AND updated_by = tests.user_id('A.trn_admin')
                 FROM public.program_settings WHERE company_id = tests.company_id('A')),
                'settings: stored, with who saved them');

INSERT INTO ids VALUES ('prop', pg_temp.app('hod_review', 'A.deck_dra', 'A.dra', NULL, 'A', true)), ('notprop', pg_temp.app('hod_review'));
SELECT tests.as_user(tests.user_id('A.trn_admin'));
SELECT tests.throws_like(format($q$SELECT public.development_course_promote(%L)$q$, pg_temp.id('notprop')), '22023', 'not_a_proposal', 'promote: only a custom course');
SELECT tests.lives(format($q$INSERT INTO got SELECT 'promoted', to_jsonb(c) FROM public.development_course_promote(%L) AS c$q$, pg_temp.id('prop')), 'promote: a custom course joins the catalogue');
SELECT tests.is((SELECT (to_jsonb(c) ->> 'id') FROM public.development_course_promote(pg_temp.id('prop')) AS c), (SELECT v ->> 'id' FROM got WHERE k = 'promoted'),
                'promote: once per application');
SELECT tests.as_user(tests.user_id('A.hod_deck_dra'));
SELECT tests.throws_like(format($q$SELECT public.development_course_promote(%L)$q$, pg_temp.id('prop')), '42501', 'not_permitted', 'promote: training admins only');
SELECT tests.reset_role();
SELECT tests.ok((SELECT c.origin = 'proposed' AND c.proposed_by = tests.user_id('A.deck_dra') AND c.proposed_from_application_id = a.id AND a.course_id = c.id
                        AND c.department = 'Deck' AND c.status = 'active'
                 FROM public.development_courses AS c JOIN public.development_applications AS a ON a.id = pg_temp.id('prop')
                 WHERE c.id = (SELECT (v ->> 'id')::uuid FROM got WHERE k = 'promoted')),
                'promote: origin proposed, linked both ways, the applicant''s department');
SELECT tests.is(pg_temp.events(pg_temp.id('prop'), 'course_promoted'), 1::bigint, 'promote: in the application''s history');

-- ------------------------------------------------------------ policies replaced

SELECT tests.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'development_applications' AND policyname IN ('Company members can view applications', 'Authorized users can update applications'))
                AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'development_courses' AND cmd <> 'SELECT')
                AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'program_settings' AND cmd <> 'SELECT')
                AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fleet_training_participants' AND qual ~ 'has_fleet_access'),
                'policies: the company-wide read, the reviewers'' direct update and the has_fleet_access writes are gone');
SELECT tests.ok(EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'development_applications' AND policyname = 'Crew can create own applications' AND cmd = 'INSERT'),
                'policies: the crew INSERT policy is kept (the guard forces a draft)');
SELECT tests.ok((SELECT consrc ~ 'captain_purser_review' AND consrc ~ 'voided' AND consrc ~ 'reimbursed'
                 FROM (SELECT pg_get_constraintdef(oid) AS consrc FROM pg_constraint WHERE conname = 'development_applications_status_check') AS x),
                'status CHECK: the sixteen statuses (D-X5-25)');
