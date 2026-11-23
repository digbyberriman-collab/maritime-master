-- user_preferences.density / show_roadmap and the dark theme default
-- (spec §A.2; D-19, D-29, D-69). The live own-row policies are unchanged.

SELECT tests.results_eq(
  $q$SELECT column_name::text, data_type::text, is_nullable::text, coalesce(column_default, '')::text
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name IN ('density', 'show_roadmap', 'theme')$q$,
  $q$VALUES ('density', 'text', 'YES', ''), ('show_roadmap', 'boolean', 'YES', ''), ('theme', 'text', 'YES', '''dark''::text')$q$,
  'check query: density and show_roadmap exist (nullable, no default) and theme defaults to dark');

SELECT tests.seed_user('A', 'A.crew', 'crew');
SELECT tests.seed_user('A', 'A.mate', 'crew');
SELECT tests.seed_user('B', 'B.crew', 'crew');
-- A row from before the change: theme 'system', nothing else chosen.
INSERT INTO public.user_preferences (user_id, theme) VALUES (tests.user_id('A.mate'), 'system');

\i supabase/migrations/20261123000200_platform_user_preferences.sql

SELECT tests.results_eq(
  format($q$SELECT theme, density, show_roadmap FROM public.user_preferences WHERE user_id = %L$q$, tests.user_id('A.mate')),
  $q$VALUES ('system'::text, NULL::text, NULL::boolean)$q$,
  'existing rows are not touched by the file (a stored system theme stays; new columns NULL = never chosen)');

SELECT tests.as_user(tests.user_id('A.crew'));
SELECT tests.lives(format($q$INSERT INTO public.user_preferences (user_id) VALUES (%L)$q$, tests.user_id('A.crew')), 'a user creates their own preferences row');
SELECT tests.results_eq(
  format($q$SELECT theme, density, show_roadmap FROM public.user_preferences WHERE user_id = %L$q$, tests.user_id('A.crew')),
  $q$VALUES ('dark'::text, NULL::text, NULL::boolean)$q$,
  'a new row is dark-first with nothing chosen');
SELECT tests.lives(format($q$UPDATE public.user_preferences SET density = 'compact', show_roadmap = true WHERE user_id = %L$q$, tests.user_id('A.crew')), 'a user saves their own density and roadmap choice');
SELECT tests.results_eq(
  format($q$SELECT density, show_roadmap FROM public.user_preferences WHERE user_id = %L$q$, tests.user_id('A.crew')),
  $q$VALUES ('compact'::text, true)$q$, 'the choices are stored');
SELECT tests.throws(format($q$UPDATE public.user_preferences SET density = 'tiny' WHERE user_id = %L$q$, tests.user_id('A.crew')), '23514', 'a density outside comfortable / default / compact is refused');
SELECT tests.lives(format($q$UPDATE public.user_preferences SET density = NULL WHERE user_id = %L$q$, tests.user_id('A.crew')), 'density can go back to NULL (device value)');
SELECT tests.denied(format($q$UPDATE public.user_preferences SET density = 'compact' WHERE user_id = %L RETURNING *$q$, tests.user_id('A.mate')), 'a user cannot change another user''s preferences (same company)');
SELECT tests.denied(format($q$SELECT * FROM public.user_preferences WHERE user_id = %L$q$, tests.user_id('A.mate')), 'a user cannot read another user''s preferences');
SELECT tests.denied(format($q$INSERT INTO public.user_preferences (user_id) VALUES (%L)$q$, tests.user_id('B.crew')), 'a user cannot create preferences for someone else (other company)');

SELECT tests.as_anon();
SELECT tests.denied('SELECT * FROM public.user_preferences', 'anon reads no preferences');
SELECT tests.reset_role();
