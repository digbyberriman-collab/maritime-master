-- The pure expiry engine of 20261124040000_fleet_expiry_engine.sql (gap/02
-- X2; DECISIONS C5, D-31; gap/08 EXP1): expiry_bucket() and
-- expiry_days_remaining() give the TS engine's answer for every row of the
-- shared EXP1 fixture (copied verbatim below and also read from
-- src/test/lib/records/expiry.test.ts, so the two never drift), the null,
-- no-expiry, NULL-window and negative-window rules; the endorsement
-- boundaries of expiry_endorsement_state(); the defaults of
-- expiry_default_window(); the resolution order and the caller rule of
-- expiry_window_for(); the frozen signatures and the grants.

SELECT tests.seed_two_tenants();

-- ------------------------------------------------------------ EXP1, verbatim

CREATE TEMP TABLE exp1 (label text, expires_on date, window_days integer, today date, bucket text, days integer) ON COMMIT DROP;
INSERT INTO exp1 VALUES
  ('a year overdue', '2025-11-22', 90, '2026-11-22', 'expired', -365),
  ('the day after the expiry date', '2026-11-21', 90, '2026-11-22', 'expired', -1),
  ('the expiry date itself', '2026-11-22', 90, '2026-11-22', 'expiring_soon', 0),
  ('the day before the expiry date', '2026-11-23', 90, '2026-11-22', 'expiring_soon', 1),
  ('last day of the 30-day tier', '2026-12-22', 90, '2026-11-22', 'expiring_soon', 30),
  ('first day past the 30-day tier', '2026-12-23', 90, '2026-11-22', 'expiring', 31),
  ('last day of the window', '2027-02-20', 90, '2026-11-22', 'expiring', 90),
  ('first day past the window', '2027-02-21', 90, '2026-11-22', 'valid', 91),
  ('passport, last day of 270', '2027-08-19', 270, '2026-11-22', 'expiring', 270),
  ('passport, past 270', '2027-08-20', 270, '2026-11-22', 'valid', 271),
  ('14-day window, last day', '2026-12-06', 14, '2026-11-22', 'expiring_soon', 14),
  ('14-day window, past it', '2026-12-07', 14, '2026-11-22', 'valid', 15),
  ('zero window, expiry date', '2026-11-22', 0, '2026-11-22', 'expiring_soon', 0),
  ('zero window, the day after', '2026-11-21', 0, '2026-11-22', 'expired', -1);
GRANT SELECT ON exp1 TO PUBLIC;

SELECT tests.is((SELECT count(*) FROM exp1), 14::bigint, 'EXP1 has its 14 rows');
SELECT tests.is(public.expiry_bucket(e.expires_on, e.window_days, e.today), e.bucket, format('EXP1 %s: bucket %s', e.label, e.bucket))
FROM exp1 AS e ORDER BY e.expires_on, e.window_days;
SELECT tests.is(public.expiry_days_remaining(e.expires_on, e.today), e.days, format('EXP1 %s: %s days', e.label, e.days))
FROM exp1 AS e ORDER BY e.expires_on, e.window_days;
SELECT tests.is(public.expiry_bucket(e.expires_on, e.window_days, e.today, false), e.bucket, format('EXP1 %s: the 4-argument form agrees', e.label))
FROM exp1 AS e ORDER BY e.expires_on, e.window_days;

-- The same table read from the TS fixture: the SQL copy above is the TS one.
\set exp1_ts `node -e "const s=require('fs').readFileSync('src/test/lib/records/expiry.test.ts','utf8');const t=(s.match(/const TODAY = '([0-9-]+)'/)||[])[1];const b=s.slice(s.indexOf('const EXPIRY_BUCKET_FIXTURE'));const e=b.indexOf('];');const re=/[{] case: '([^']+)', expiresOn: '([0-9-]+)', windowDays: ([0-9]+), today: TODAY, bucket: '([a-z_]+)', days: (-?[0-9]+) [}]/g;const out=[];let m;const body=b.slice(0,e);while((m=re.exec(body))!==null){out.push([m[1],m[2],Number(m[3]),t,m[4],Number(m[5])]);}console.log(JSON.stringify(out));"`
CREATE TEMP TABLE exp1_ts ON COMMIT DROP AS
SELECT x ->> 0 AS label, (x ->> 1)::date AS expires_on, (x ->> 2)::integer AS window_days, (x ->> 3)::date AS today, x ->> 4 AS bucket, (x ->> 5)::integer AS days
FROM jsonb_array_elements(:'exp1_ts'::jsonb) AS x;
GRANT SELECT ON exp1_ts TO PUBLIC;
SELECT tests.is((SELECT count(*) FROM exp1_ts), 14::bigint, 'the TS fixture (src/test/lib/records/expiry.test.ts) has 14 rows');
SELECT tests.results_eq('SELECT label, expires_on, window_days, today, bucket, days FROM exp1_ts',
                        'SELECT label, expires_on, window_days, today, bucket, days FROM exp1',
                        'the SQL copy of EXP1 equals the TS fixture row for row');

-- ------------------------------------------------------------ null, no-expiry and window rules

SELECT tests.is(public.expiry_bucket(NULL, 90, '2026-11-22'), 'no_expiry', 'a NULL date is no_expiry (D-31)');
SELECT tests.is(public.expiry_days_remaining(NULL, '2026-11-22'), NULL::integer, 'a NULL date has no days remaining');
SELECT tests.is(public.expiry_bucket('2025-01-01', 90, '2026-11-22', true), 'no_expiry', 'p_no_expiry wins over a past date');
SELECT tests.is(public.expiry_bucket(NULL, 90, NULL), 'no_expiry', 'no date needs no today');
SELECT tests.is(public.expiry_bucket('2026-11-22', 90, '2026-11-22', NULL), 'expiring_soon', 'a NULL no-expiry flag reads as false');
SELECT tests.is(public.expiry_bucket('2027-01-21', NULL, '2026-11-22'), 'expiring', 'a NULL window is the default 90 (60 days: expiring)');
SELECT tests.is(public.expiry_bucket('2027-02-20', NULL, '2026-11-22'), 'expiring', 'NULL window: day 90 is expiring');
SELECT tests.is(public.expiry_bucket('2027-02-21', NULL, '2026-11-22'), 'valid', 'NULL window: day 91 is valid');
SELECT tests.throws_like($q$SELECT public.expiry_bucket('2026-12-01', -1, '2026-11-22')$q$, '22023', 'invalid_window', 'a negative window is refused (22023)');
SELECT tests.throws_like($q$SELECT public.expiry_bucket(NULL, -1, '2026-11-22')$q$, '22023', 'invalid_window', 'the window is checked first, as the TS engine does, even with no date');
SELECT tests.throws_like($q$SELECT public.expiry_bucket('2026-12-01', 90, NULL)$q$, '22023', 'today_required', 'a dated item needs today');
SELECT tests.is(public.expiry_bucket('2026-12-07', 5, '2026-11-22'), 'valid', 'a 5-day window: 15 days out is valid (the soon tier never opens before the window)');
SELECT tests.is(public.expiry_bucket('2026-11-27', 5, '2026-11-22'), 'expiring_soon', 'a 5-day window: its last day is expiring_soon');
SELECT tests.is(public.expiry_bucket('2028-11-21', 1095, '2026-11-22'), 'expiring', 'the longest window (1095 days) still works');

-- ------------------------------------------------------------ endorsement state

SELECT tests.is(public.expiry_endorsement_state('2026-11-21', '2026-11-22'), 'overdue', 'endorsement: the day after the due date is overdue');
SELECT tests.is(public.expiry_endorsement_state('2026-11-22', '2026-11-22'), 'due', 'endorsement: the due date itself is due');
SELECT tests.is(public.expiry_endorsement_state('2026-12-22', '2026-11-22'), 'due', 'endorsement: 30 days before is due (default window)');
SELECT tests.is(public.expiry_endorsement_state('2026-12-23', '2026-11-22'), NULL::text, 'endorsement: 31 days before is nothing yet');
SELECT tests.is(public.expiry_endorsement_state(NULL, '2026-11-22'), NULL::text, 'endorsement: no due date is nothing');
SELECT tests.is(public.expiry_endorsement_state('2026-11-23', '2026-11-22', 0), NULL::text, 'endorsement: a zero window flags only the due date');
SELECT tests.is(public.expiry_endorsement_state('2026-11-22', '2026-11-22', 0), 'due', 'endorsement: a zero window: the due date is due');
SELECT tests.is(public.expiry_endorsement_state('2027-02-20', '2026-11-22', 90), 'due', 'endorsement: a 90-day window');
SELECT tests.is(public.expiry_endorsement_state('2026-12-20', '2026-11-22', NULL), 'due', 'endorsement: a NULL window is 30');
SELECT tests.throws_like($q$SELECT public.expiry_endorsement_state('2026-12-01', '2026-11-22', -1)$q$, '22023', 'invalid_window', 'endorsement: a negative window is refused');
SELECT tests.throws_like($q$SELECT public.expiry_endorsement_state('2026-12-01', NULL)$q$, '22023', 'today_required', 'endorsement: a due date needs today');

-- ------------------------------------------------------------ default windows

SELECT tests.is(public.expiry_default_window('passport'), 270, 'default window: passports 270 days');
SELECT tests.is(public.expiry_default_window(t), 90, format('default window: %s 90 days', t))
FROM unnest(ARRAY['vessel_certificate', 'insurance_policy', 'visa', 'crew_document', 'crew_qualification', 'medical', 'vaccination',
                  'work_authorisation', 'contract', 'training_course']) AS t;
SELECT tests.is(public.expiry_default_window(NULL), 90, 'default window: no item type 90 days');

-- ------------------------------------------------------------ expiry_window_for: resolution order

INSERT INTO public.expiry_window_rules (company_id, item_type, certificate_type_id, warn_days) VALUES
  (tests.company_id('A'), 'crew_document', NULL, 60),
  (tests.company_id('A'), 'crew_document', tests.id('doctype:seaman_book'), 120),
  (tests.company_id('A'), 'passport', NULL, 180),
  (tests.company_id('A'), 'visa', tests.id('doctype:schengen'), 45),
  (tests.company_id('B'), 'vessel_certificate', NULL, 30);

-- As the SQL editor (no JWT): any company.
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'crew_document', tests.id('doctype:seaman_book')), 120, 'window: the type rule wins');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'crew_document', tests.id('doctype:other')), 60, 'window: another type falls back to the item rule');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'crew_document'), 60, 'window: no type, the item rule');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'passport'), 180, 'window: a company passport rule replaces 270');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'crew_qualification', tests.id('doctype:seaman_book')), 90,
                'window: a type rule under another item type does not apply (default 90)');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'visa'), 90, 'window: a visa without its type gets the default (the type rule needs the type)');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'visa', tests.id('doctype:schengen')), 45, 'window: a visa type rule');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'vessel_certificate'), 90, 'window: company B''s rule never applies to A');
SELECT tests.is(public.expiry_window_for(tests.company_id('B'), 'vessel_certificate'), 30, 'window: B''s own rule');
SELECT tests.is(public.expiry_window_for(tests.company_id('B'), 'passport'), 270, 'window: no rule, the passport default');
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), NULL, tests.id('doctype:seaman_book')), 90, 'window: no item type matches no rule (90)');
SELECT tests.throws_like(format($q$SELECT public.expiry_window_for(%L, 'medical_certificate')$q$, tests.company_id('A')), '22023', 'invalid_item_type',
                         'window: an unknown item type is refused (the frozen list says medical)');

-- The caller rule.
SELECT tests.as_user(tests.user_id('A.crew_hyd'));
SELECT tests.is(public.expiry_window_for(tests.company_id('A'), 'crew_document', tests.id('doctype:seaman_book')), 120, 'window: an active member of A reads A''s window');
SELECT tests.throws_like(format($q$SELECT public.expiry_window_for(%L, 'vessel_certificate')$q$, tests.company_id('B')), '42501', 'not_permitted',
                         'window: a member of A is refused B''s windows');
SELECT tests.throws_like($q$SELECT public.expiry_window_for(NULL, 'vessel_certificate')$q$, '42501', 'not_permitted', 'window: a signed-in caller needs a company');
SELECT tests.as_user(tests.user_id('A.disabled'));
SELECT tests.throws_like(format($q$SELECT public.expiry_window_for(%L, 'crew_document')$q$, tests.company_id('A')), '42501', 'not_permitted',
                         'window: a disabled member is refused');
SELECT tests.as_anon();
SELECT tests.throws(format($q$SELECT public.expiry_window_for(%L, 'crew_document')$q$, tests.company_id('A')), '42501', 'window: anon cannot execute it');
SELECT tests.throws($q$SELECT public.expiry_bucket('2026-12-01', 90, '2026-11-22')$q$, '42501', 'expiry_bucket: anon cannot execute it');
SELECT tests.as_service();
SELECT tests.is(public.expiry_window_for(tests.company_id('B'), 'vessel_certificate'), 30, 'window: the service role answers for any company');
SELECT tests.reset_role();

-- ------------------------------------------------------------ frozen signatures and grants

SELECT tests.ok(to_regprocedure('public.expiry_bucket(date,integer,date,boolean)') IS NOT NULL, 'frozen: expiry_bucket(date, integer, date, boolean)');
SELECT tests.ok(to_regprocedure('public.expiry_window_for(uuid,text,uuid)') IS NOT NULL, 'frozen: expiry_window_for(uuid, text, uuid)');
SELECT tests.ok(to_regprocedure('public.expiry_endorsement_state(date,date,integer)') IS NOT NULL, 'frozen: expiry_endorsement_state(date, date, integer)');
SELECT tests.is((SELECT pronargdefaults FROM pg_proc WHERE oid = 'public.expiry_bucket(date,integer,date,boolean)'::regprocedure), 1::smallint,
                'expiry_bucket: p_no_expiry has a default (callable with three arguments)');
SELECT tests.is((SELECT pronargdefaults FROM pg_proc WHERE oid = 'public.expiry_window_for(uuid,text,uuid)'::regprocedure), 1::smallint,
                'expiry_window_for: the certificate type has a default');
SELECT tests.is((SELECT provolatile FROM pg_proc WHERE oid = 'public.expiry_bucket(date,integer,date,boolean)'::regprocedure), 'i'::"char", 'expiry_bucket is IMMUTABLE');
SELECT tests.is((SELECT provolatile FROM pg_proc WHERE oid = 'public.expiry_window_for(uuid,text,uuid)'::regprocedure), 's'::"char", 'expiry_window_for is STABLE');
SELECT tests.ok((SELECT prosecdef FROM pg_proc WHERE oid = 'public.expiry_window_for(uuid,text,uuid)'::regprocedure), 'expiry_window_for is a definer (invoker views call it)');
SELECT tests.ok(has_function_privilege('authenticated', f, 'EXECUTE') AND has_function_privilege('service_role', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE'),
                format('%s: authenticated and the service role, not anon', f))
FROM unnest(ARRAY['public.expiry_bucket(date,integer,date,boolean)', 'public.expiry_days_remaining(date,date)',
                  'public.expiry_endorsement_state(date,date,integer)', 'public.expiry_default_window(text)',
                  'public.expiry_window_for(uuid,text,uuid)']) AS f;
SELECT tests.is(
  (SELECT array_agg(v ORDER BY v) FROM (SELECT unnest(regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g')) AS v
                                          FROM pg_constraint AS c WHERE c.conname = 'expiry_window_rules_item_type_check') AS x),
  ARRAY['contract', 'crew_document', 'crew_qualification', 'insurance_policy', 'medical', 'passport', 'training_course', 'vaccination',
        'vessel_certificate', 'visa', 'work_authorisation'],
  'frozen: the eleven item types (medical, not medical_certificate)');
