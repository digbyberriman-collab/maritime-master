-- Crew requirement engine parity (X1-06,
-- 20261124060600_crew_compliance.sql; gap/04 W5, C34, C36): every case of
-- src/test/crew/fixtures/complianceCases.json, built as one crew member on
-- one vessel of its own company, through crew_requirement_status_for() and
-- crew_compliance_summary_for(), gives the case's expected rows and summary.
-- src/test/crew/compliance.test.ts holds lib/compliance.ts to the same
-- answers, so the TS mirror and the SQL engine agree case by case.
--
-- A case: rows (group, kind, options = type keys or template keys, sort,
-- ticked for Deckhand unless "ticked": false, then Bosun), the case's own
-- company types and rules on top of STORM's, documents (type, expiry as a
-- day offset or null, "No expiry", verification, alerts off, file,
-- removed), familiarisation templates and records, the person (a title
-- other than Deckhand; no login = a pending placement). Written as the
-- superuser (no JWT: the guards' maintenance path).

SELECT tests.seed_two_tenants();

\set cases `cat src/test/crew/fixtures/complianceCases.json`
CREATE TEMP TABLE pcase ON COMMIT DROP AS
SELECT e.n::integer AS n, e.c ->> 'name' AS name, e.c
FROM jsonb_array_elements(:'cases'::jsonb -> 'cases') WITH ORDINALITY AS e(c, n);
-- The ids of everything a case creates, by kind and key.
CREATE TEMP TABLE pmap (n integer, kind text, key text, id uuid, PRIMARY KEY (n, kind, key)) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.pc_company(p_n integer) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'P' || p_n $$;
CREATE OR REPLACE FUNCTION pg_temp.pc_id(p_n integer, p_kind text, p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT tests.id('x16p:' || p_n || ':' || p_kind || ':' || p_key)
$$;

-- Builds one case's world; returns the vessel id.
CREATE OR REPLACE FUNCTION pg_temp.pc_build(p_n integer, p_c jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_company_key text := pg_temp.pc_company(p_n);
  v_vessel_key text := v_company_key || '.v';
  v_person_key text := v_company_key || '.p';
  v_company uuid;
  v_vessel uuid;
  v_profile uuid;
  v_user uuid;
  v_title text := coalesce(p_c #>> '{person,title}', 'Deckhand');
  v_login boolean := coalesce((p_c #>> '{person,login}')::boolean, true);
  v_deckhand uuid;
  v_bosun uuid;
  t jsonb;
  r jsonb;
  o record;
  d jsonb;
  f jsonb;
  v_row uuid;
  v_type uuid;
  v_kind text;
BEGIN
  v_vessel := tests.seed_vessel(v_company_key, v_vessel_key);
  v_company := tests.company_id(v_company_key);
  IF v_login THEN
    v_user := tests.seed_user(v_company_key, v_person_key, 'crew');
    PERFORM tests.seed_assignment(v_person_key, v_vessel_key, true, v_title);
  ELSE
    PERFORM tests.seed_profile(v_company_key, v_person_key, 'crew', 'not_invited', NULL,
      jsonb_build_object('is_imported', true, 'imported_vessel_id', v_vessel, 'rank', v_title));
  END IF;
  v_profile := tests.profile_id(v_person_key);
  v_deckhand := public.crew_position_for(v_company, v_vessel, 'Deckhand');
  v_bosun := public.crew_position_for(v_company, v_vessel, 'Bosun');
  IF v_deckhand IS NULL OR v_bosun IS NULL THEN
    RAISE EXCEPTION 'parity setup: the Deckhand and Bosun positions must exist';
  END IF;

  -- The case's company types (item type by category, as lib/documentTabs itemTypeForCategory).
  FOR t IN SELECT x FROM jsonb_array_elements(coalesce(p_c -> 'types', '[]'::jsonb)) AS x LOOP
    INSERT INTO public.crew_document_types (id, company_id, category_key, key, name, expiry_item_type, is_identity, is_active)
    VALUES (pg_temp.pc_id(p_n, 'type', t ->> 'key'), v_company, t ->> 'category', t ->> 'key', t ->> 'name',
            CASE t ->> 'category'
              WHEN 'passports' THEN 'passport' WHEN 'visas' THEN 'visa' WHEN 'work_permits' THEN 'work_authorisation'
              WHEN 'medical_fitness' THEN 'medical' WHEN 'health_records' THEN 'medical'
              WHEN 'seafarer_identity' THEN 'crew_document' WHEN 'identity_other' THEN 'crew_document'
              WHEN 'licences' THEN 'crew_document' WHEN 'other_documents' THEN 'crew_document'
              ELSE 'crew_qualification' END,
            (t ->> 'category') = 'passports', true);
  END LOOP;
  -- The case's company rules.
  FOR t IN SELECT x FROM jsonb_array_elements(coalesce(p_c -> 'rules', '[]'::jsonb)) AS x LOOP
    INSERT INTO public.crew_document_type_satisfies (company_id, type_id, satisfies_type_id, kind)
    VALUES (v_company, pg_temp.pc_type(p_n, t ->> 'type'), pg_temp.pc_type(p_n, t ->> 'satisfies'), t ->> 'kind');
  END LOOP;
  -- Templates.
  FOR t IN SELECT x FROM jsonb_array_elements(coalesce(p_c -> 'templates', '[]'::jsonb)) AS x LOOP
    INSERT INTO public.familiarization_templates (id, vessel_id, template_name, sections, total_duration_days, is_active)
    VALUES (pg_temp.pc_id(p_n, 'template', t #>> '{}'), v_vessel, 'Template ' || (t #>> '{}'), '[]'::jsonb, 14, true);
    INSERT INTO pmap VALUES (p_n, 'template', t #>> '{}', pg_temp.pc_id(p_n, 'template', t #>> '{}'));
  END LOOP;
  -- Rows, options, ticks.
  FOR r IN SELECT x FROM jsonb_array_elements(p_c -> 'rows') AS x LOOP
    v_row := pg_temp.pc_id(p_n, 'row', r ->> 'key');
    v_kind := coalesce(r ->> 'kind', 'document');
    INSERT INTO public.crew_requirement_rows (id, company_id, vessel_id, group_key, label, kind, sort_order)
    VALUES (v_row, v_company, v_vessel, r ->> 'group', r ->> 'key', v_kind, (r ->> 'sort')::integer);
    INSERT INTO pmap VALUES (p_n, 'row', r ->> 'key', v_row);
    FOR o IN SELECT x #>> '{}' AS k, (i - 1)::integer AS s FROM jsonb_array_elements(r -> 'options') WITH ORDINALITY AS e(x, i) LOOP
      IF v_kind = 'familiarisation' THEN
        INSERT INTO public.crew_requirement_options (row_id, familiarization_template_id, sort_order)
        VALUES (v_row, pg_temp.pc_id(p_n, 'template', o.k), o.s);
      ELSE
        INSERT INTO public.crew_requirement_options (row_id, document_type_id, sort_order)
        VALUES (v_row, pg_temp.pc_type(p_n, o.k), o.s);
      END IF;
    END LOOP;
    INSERT INTO public.crew_requirement_positions (row_id, position_id)
    VALUES (v_row, CASE WHEN coalesce((r ->> 'ticked')::boolean, true) THEN v_deckhand ELSE v_bosun END);
  END LOOP;
  -- Documents.
  FOR d IN SELECT x FROM jsonb_array_elements(coalesce(p_c -> 'documents', '[]'::jsonb)) AS x LOOP
    v_type := pg_temp.pc_type(p_n, d ->> 'type');
    INSERT INTO public.crew_certificates (id, user_id, profile_id, certificate_type, certificate_name, expiry_date, no_expiry,
                                          document_type_id, verification_status, alerts_muted, muted_at, file_path, deleted_at, status)
    SELECT pg_temp.pc_id(p_n, 'doc', d ->> 'key'), v_user, v_profile, ty.name, ty.name,
           CASE WHEN d -> 'expiry' = 'null'::jsonb THEN NULL ELSE current_date + (d ->> 'expiry')::integer END,
           coalesce((d ->> 'noExpiry')::boolean, false), ty.id, coalesce(d ->> 'status', 'verified'),
           coalesce((d ->> 'muted')::boolean, false), CASE WHEN coalesce((d ->> 'muted')::boolean, false) THEN now() END,
           CASE WHEN coalesce((d ->> 'file')::boolean, true)
                THEN v_company::text || '/crew/' || v_profile::text || '/documents/' || pg_temp.pc_id(p_n, 'doc', d ->> 'key')::text || '-scan.pdf' END,
           CASE WHEN coalesce((d ->> 'deleted')::boolean, false) THEN now() END,
           'Valid'
    FROM public.crew_document_types AS ty WHERE ty.id = v_type;
    INSERT INTO pmap VALUES (p_n, 'doc', d ->> 'key', pg_temp.pc_id(p_n, 'doc', d ->> 'key'));
  END LOOP;
  -- Familiarisation records (keyed on the login).
  FOR f IN SELECT x FROM jsonb_array_elements(coalesce(p_c -> 'familiarisation', '[]'::jsonb)) AS x LOOP
    INSERT INTO public.familiarization_records (id, user_id, vessel_id, template_id, join_date, target_completion_date, status, actual_completion_date)
    VALUES (pg_temp.pc_id(p_n, 'record', f ->> 'key'), v_user, v_vessel, pg_temp.pc_id(p_n, 'template', f ->> 'template'),
            current_date - 30, current_date + 14, f ->> 'status',
            CASE WHEN f -> 'completed' = 'null'::jsonb THEN NULL ELSE current_date + (f ->> 'completed')::integer END);
    INSERT INTO pmap VALUES (p_n, 'record', f ->> 'key', pg_temp.pc_id(p_n, 'record', f ->> 'key'));
  END LOOP;
  RETURN v_vessel;
END;
$$;

-- A type key of the case: its own company type, else STORM's.
CREATE OR REPLACE FUNCTION pg_temp.pc_type(p_n integer, p_key text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT t.id INTO v_id FROM public.crew_document_types AS t
  WHERE t.key = p_key AND (t.company_id = tests.company_id(pg_temp.pc_company(p_n)) OR t.company_id IS NULL)
  ORDER BY (t.company_id IS NULL)
  LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'parity setup: case % names an unknown type %', p_n, p_key;
  END IF;
  RETURN v_id;
END;
$$;

CREATE TEMP TABLE pvessel ON COMMIT DROP AS SELECT pc.n, pc.name, pg_temp.pc_build(pc.n, pc.c) AS vessel_id FROM pcase AS pc ORDER BY pc.n;

SELECT tests.is((SELECT count(*) FROM pvessel), (SELECT count(*) FROM pcase), format('setup: every case built (%s cases)', (SELECT count(*) FROM pcase)));
SELECT tests.ok((SELECT count(*) FROM pcase) >= 40, 'setup: the fixture holds at least 40 cases');

-- ------------------------------------------------------------ the expected answers, with the fixture's defaults

CREATE TEMP TABLE pwant_rows ON COMMIT DROP AS
SELECT pc.n, pc.name, e.key AS row_key,
       e.v ->> 'state' AS state,
       e.v ->> 'doc' AS doc, e.v ->> 'record' AS record, e.v ->> 'type' AS type_key,
       e.v ->> 'via' AS via, e.v ->> 'viaOption' AS via_option,
       CASE WHEN e.v ? 'expiry' AND e.v -> 'expiry' <> 'null'::jsonb THEN (e.v ->> 'expiry')::integer END AS expiry,
       coalesce((e.v ->> 'noExpiry')::boolean, false) AS no_expiry,
       e.v ->> 'bucket' AS bucket,
       coalesce((e.v ->> 'conditional')::boolean, false) AS conditional,
       coalesce((e.v ->> 'muted')::boolean, false) AS muted,
       coalesce((e.v ->> 'missingDate')::boolean, false) AS missing_date,
       CASE WHEN e.v ? 'hasFile' THEN (e.v ->> 'hasFile')::boolean WHEN e.v ->> 'doc' IS NOT NULL THEN true END AS has_file,
       e.v ->> 'gap' AS gap, e.v ->> 'nearest' AS nearest, e.v ->> 'nearestRecord' AS nearest_record, e.v ->> 'nearestType' AS nearest_type
FROM pcase AS pc
CROSS JOIN LATERAL jsonb_each(pc.c #> '{expect,rows}') AS e(key, v);

CREATE TEMP TABLE pwant_sum ON COMMIT DROP AS
SELECT pc.n, pc.name,
       (s ->> 'required')::integer AS required, (s ->> 'met')::integer AS met, (s ->> 'expiring')::integer AS expiring,
       (s ->> 'expired')::integer AS expired, (s ->> 'missing')::integer AS missing, (s ->> 'conditional')::integer AS conditional,
       (s ->> 'muted')::integer AS muted,
       (s #>> '{docs,0}')::integer AS docs_required, (s #>> '{docs,1}')::integer AS docs_met,
       (s #>> '{stcw,0}')::integer AS stcw_required, (s #>> '{stcw,1}')::integer AS stcw_met,
       (s #>> '{quals,0}')::integer AS quals_required, (s #>> '{quals,1}')::integer AS quals_met,
       (s #>> '{fam,0}')::integer AS fam_required, (s #>> '{fam,1}')::integer AS fam_met,
       s ->> 'status' AS status,
       CASE WHEN s -> 'nextExpiry' <> 'null'::jsonb THEN (s ->> 'nextExpiry')::integer END AS next_expiry,
       s ->> 'dotDocuments' AS dot_documents, s ->> 'dotQualifications' AS dot_qualifications,
       (SELECT coalesce(jsonb_agg(i ORDER BY o), '[]'::jsonb) FROM jsonb_array_elements(s -> 'issues') WITH ORDINALITY AS x(i, o)) AS issues
FROM pcase AS pc
CROSS JOIN LATERAL (SELECT pc.c #> '{expect,summary}' AS s) AS ss;

-- ------------------------------------------------------------ what the engine answers, in the fixture's terms

CREATE TEMP TABLE pgot_rows ON COMMIT DROP AS
SELECT pv.n, pv.name, rk.key AS row_key,
       s.state,
       dk.key AS doc, rc.key AS record, ty.key AS type_key,
       s.satisfied_via AS via, vo.key AS via_option,
       (s.next_expiry - current_date) AS expiry,
       s.no_expiry, s.bucket, s.is_conditional AS conditional, s.is_muted AS muted, s.missing_date, s.has_file,
       s.gap_reason AS gap, nd.key AS nearest, nr.key AS nearest_record, nt.key AS nearest_type,
       s.satisfying_name, s.tab
FROM pvessel AS pv
CROSS JOIN LATERAL public.crew_requirement_status_for(ARRAY[pv.vessel_id], current_date, NULL) AS s
LEFT JOIN pmap AS rk ON rk.n = pv.n AND rk.kind = 'row' AND rk.id = s.row_id
LEFT JOIN pmap AS dk ON dk.n = pv.n AND dk.kind = 'doc' AND dk.id = s.satisfying_document_id
LEFT JOIN pmap AS rc ON rc.n = pv.n AND rc.kind = 'record' AND rc.id = s.satisfying_record_id
LEFT JOIN public.crew_document_types AS ty ON ty.id = s.satisfying_type_id
LEFT JOIN public.crew_document_types AS vo ON vo.id = s.via_option_type_id
LEFT JOIN pmap AS nd ON nd.n = pv.n AND nd.kind = 'doc' AND nd.id = s.nearest_document_id
LEFT JOIN pmap AS nr ON nr.n = pv.n AND nr.kind = 'record' AND nr.id = s.nearest_record_id
LEFT JOIN public.crew_document_types AS nt ON nt.id = s.nearest_type_id;

CREATE TEMP TABLE pgot_sum ON COMMIT DROP AS
SELECT pv.n, pv.name, m.required, m.met, m.expiring, m.expired, m.missing, m.conditional, m.muted,
       m.docs_required, m.docs_met, m.stcw_required, m.stcw_met, m.quals_required, m.quals_met, m.fam_required, m.fam_met,
       m.status, (m.next_expiry - current_date) AS next_expiry, m.dot_documents, m.dot_qualifications,
       (SELECT coalesce(jsonb_agg(jsonb_build_array(rk.key, i ->> 'reason') ORDER BY o), '[]'::jsonb)
        FROM jsonb_array_elements(m.issues) WITH ORDINALITY AS x(i, o)
        LEFT JOIN pmap AS rk ON rk.n = pv.n AND rk.kind = 'row' AND rk.id = (i ->> 'row_id')::uuid) AS issues,
       m.profile_id, m.placement_kind
FROM pvessel AS pv
CROSS JOIN LATERAL public.crew_compliance_summary_for(ARRAY[pv.vessel_id], current_date, NULL) AS m;

GRANT SELECT ON pcase, pmap, pvessel, pwant_rows, pwant_sum, pgot_rows, pgot_sum TO PUBLIC;

SELECT tests.is((SELECT count(*) FROM pgot_sum), (SELECT count(*) FROM pcase), 'one summary row per case: the person is on their vessel''s crew (a pending placement included)');
SELECT tests.is((SELECT count(*) FROM pgot_sum WHERE placement_kind = 'pending_placement'), 1::bigint, 'the no-login case is read as a pending placement');

-- ------------------------------------------------------------ parity, case by case

SELECT tests.is_empty(format($q$
    (SELECT row_key, state, doc, record, type_key, via, via_option, expiry, no_expiry, bucket, conditional, muted, missing_date, has_file, gap, nearest, nearest_record, nearest_type
     FROM pwant_rows WHERE n = %1$s
     EXCEPT
     SELECT row_key, state, doc, record, type_key, via, via_option, expiry, no_expiry, bucket, conditional, muted, missing_date, has_file, gap, nearest, nearest_record, nearest_type
     FROM pgot_rows WHERE n = %1$s)
    UNION ALL
    (SELECT row_key, state, doc, record, type_key, via, via_option, expiry, no_expiry, bucket, conditional, muted, missing_date, has_file, gap, nearest, nearest_record, nearest_type
     FROM pgot_rows WHERE n = %1$s
     EXCEPT
     SELECT row_key, state, doc, record, type_key, via, via_option, expiry, no_expiry, bucket, conditional, muted, missing_date, has_file, gap, nearest, nearest_record, nearest_type
     FROM pwant_rows WHERE n = %1$s)$q$, pc.n),
  format('rows: %s', pc.name))
FROM pcase AS pc ORDER BY pc.n;

SELECT tests.is_empty(format($q$
    (SELECT required, met, expiring, expired, missing, conditional, muted, docs_required, docs_met, stcw_required, stcw_met,
            quals_required, quals_met, fam_required, fam_met, status, next_expiry, dot_documents, dot_qualifications, issues
     FROM pwant_sum WHERE n = %1$s
     EXCEPT
     SELECT required, met, expiring, expired, missing, conditional, muted, docs_required, docs_met, stcw_required, stcw_met,
            quals_required, quals_met, fam_required, fam_met, status, next_expiry, dot_documents, dot_qualifications, issues
     FROM pgot_sum WHERE n = %1$s)
    UNION ALL
    (SELECT required, met, expiring, expired, missing, conditional, muted, docs_required, docs_met, stcw_required, stcw_met,
            quals_required, quals_met, fam_required, fam_met, status, next_expiry, dot_documents, dot_qualifications, issues
     FROM pgot_sum WHERE n = %1$s
     EXCEPT
     SELECT required, met, expiring, expired, missing, conditional, muted, docs_required, docs_met, stcw_required, stcw_met,
            quals_required, quals_met, fam_required, fam_met, status, next_expiry, dot_documents, dot_qualifications, issues
     FROM pwant_sum WHERE n = %1$s)$q$, pc.n),
  format('summary: %s', pc.name))
FROM pcase AS pc ORDER BY pc.n;

-- ------------------------------------------------------------ what the cases do not pin

SELECT tests.is_empty($q$
  SELECT g.name, g.row_key FROM pgot_rows AS g
  JOIN public.crew_document_types AS t ON t.key = g.type_key
  WHERE g.doc IS NOT NULL AND g.satisfying_name IS DISTINCT FROM t.name
    AND (t.company_id IS NULL OR t.company_id = tests.company_id(pg_temp.pc_company(g.n)))$q$,
  'every met cell names its document''s type');
SELECT tests.is_empty($q$SELECT name, row_key FROM pgot_rows WHERE record IS NOT NULL AND satisfying_name IS DISTINCT FROM 'Template t1' AND satisfying_name IS DISTINCT FROM 'Template t2'$q$,
  'a completed familiarisation names its template');
SELECT tests.is((SELECT string_agg(DISTINCT tab, ',' ORDER BY tab) FROM pgot_rows WHERE name = 'tabs_dots_and_issues'), 'documents,familiarisation,qualifications,stcw',
  'tabs: a medical certificate and a passport on Documents, PST on STCW, a CoC on Qualifications, familiarisation on its own');
SELECT tests.ok((SELECT count(*) FROM pgot_rows) = (SELECT count(*) FROM pwant_rows), format('row count: %s engine rows for %s expected', (SELECT count(*) FROM pgot_rows), (SELECT count(*) FROM pwant_rows)));
