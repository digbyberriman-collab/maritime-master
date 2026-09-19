-- =================================================================
-- HEALTH & WELLNESS PHASE 5: VIEWS, ALERTS AND SEEDS
-- =================================================================
-- 1. hw_expiry_items      — one row per upcoming health date
-- 2. hw_fitness_status    — current fitness to work per person
-- 3. hw_generate_alerts() — feeds the existing alerts table
-- 4. Notification types
-- 5. Seed helpers: MCA MSN 1768 Category A medical stores, the default
--    screening template, a starter spa menu and exercise sources
-- =================================================================

-- ---------------------------------------------------------------
-- 1. hw_expiry_items
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.hw_expiry_items
WITH (security_invoker = true) AS
  SELECT
    'fitness'::text AS item_type,
    f.id AS record_id,
    f.company_id,
    hp.id AS person_id,
    hp.profile_id,
    COALESCE(hp.preferred_name, hp.first_name) || ' ' || hp.last_name AS person_name,
    hp.vessel_id,
    upper(f.assessment_type) || ' certificate' AS label,
    f.expires_on AS due_date,
    (f.expires_on - CURRENT_DATE) AS days_remaining
  FROM public.med_fitness_assessments f
  JOIN public.hw_people hp ON hp.id = f.person_id
  WHERE f.expires_on IS NOT NULL
    AND f.status IN ('fit', 'fit_with_restrictions')
    AND hp.is_active
UNION ALL
  SELECT
    'vaccination', v.id, v.company_id, hp.id, hp.profile_id,
    COALESCE(hp.preferred_name, hp.first_name) || ' ' || hp.last_name,
    hp.vessel_id, v.vaccine || ' validity', v.valid_until,
    (v.valid_until - CURRENT_DATE)
  FROM public.med_vaccinations v
  JOIN public.hw_people hp ON hp.id = v.person_id
  WHERE v.valid_until IS NOT NULL AND hp.is_active
UNION ALL
  SELECT
    'practitioner_licence', pr.id, pr.company_id, NULL::uuid, pr.profile_id,
    pr.full_name, pr.vessel_id,
    COALESCE(pr.role_title, initcap(pr.discipline)) || ' licence', pr.license_expiry,
    (pr.license_expiry - CURRENT_DATE)
  FROM public.hw_practitioners pr
  WHERE pr.license_expiry IS NOT NULL AND pr.is_active
UNION ALL
  SELECT
    'practitioner_qualification', q.id, q.company_id, NULL::uuid, pr.profile_id,
    pr.full_name, pr.vessel_id, q.name, q.expiry_date,
    (q.expiry_date - CURRENT_DATE)
  FROM public.hw_practitioner_qualifications q
  JOIN public.hw_practitioners pr ON pr.id = q.practitioner_id
  WHERE q.expiry_date IS NOT NULL AND pr.is_active
UNION ALL
  SELECT
    'medical_stock', i.id, i.company_id, NULL::uuid, NULL::uuid,
    i.name, i.vessel_id, i.name || ' expiry', i.expiry_date,
    (i.expiry_date - CURRENT_DATE)
  FROM public.med_supply_items i
  WHERE i.expiry_date IS NOT NULL AND i.is_active
UNION ALL
  SELECT
    'medical_equipment', e.id, e.company_id, NULL::uuid, NULL::uuid,
    e.name, e.vessel_id, e.name || ' check', e.next_check_due,
    (e.next_check_due - CURRENT_DATE)
  FROM public.med_equipment e
  WHERE e.next_check_due IS NOT NULL AND e.status <> 'retired'
UNION ALL
  SELECT
    'medical_equipment_service', e.id, e.company_id, NULL::uuid, NULL::uuid,
    e.name, e.vessel_id, e.name || ' service', e.next_service_due,
    (e.next_service_due - CURRENT_DATE)
  FROM public.med_equipment e
  WHERE e.next_service_due IS NOT NULL AND e.status <> 'retired'
UNION ALL
  SELECT
    'first_aid_kit', k.id, k.company_id, NULL::uuid, NULL::uuid,
    k.name, k.vessel_id, k.name || ' inspection', k.next_inspection_due,
    (k.next_inspection_due - CURRENT_DATE)
  FROM public.med_first_aid_kits k
  WHERE k.next_inspection_due IS NOT NULL
UNION ALL
  SELECT
    'protocol_review', pl.id, pl.company_id, NULL::uuid, NULL::uuid,
    pl.title, pl.vessel_id, pl.title || ' review', pl.review_due,
    (pl.review_due - CURRENT_DATE)
  FROM public.med_protocols pl
  WHERE pl.review_due IS NOT NULL AND pl.status = 'active'
UNION ALL
  SELECT
    'screening_due', r.id, r.company_id, hp.id, hp.profile_id,
    COALESCE(hp.preferred_name, hp.first_name) || ' ' || hp.last_name,
    hp.vessel_id, t.name, r.due_on, (r.due_on - CURRENT_DATE)
  FROM public.med_screening_records r
  JOIN public.hw_people hp ON hp.id = r.person_id
  JOIN public.med_screening_templates t ON t.id = r.template_id
  WHERE r.due_on IS NOT NULL AND r.status IN ('invited', 'in_progress');

COMMENT ON VIEW public.hw_expiry_items IS 'Every upcoming health date in one shape. Company scoped by the underlying tables RLS (security_invoker).';

-- ---------------------------------------------------------------
-- 2. hw_fitness_status — the current certificate per person
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.hw_fitness_status
WITH (security_invoker = true) AS
  SELECT DISTINCT ON (f.person_id)
    f.person_id,
    f.company_id,
    hp.profile_id,
    COALESCE(hp.preferred_name, hp.first_name) || ' ' || hp.last_name AS person_name,
    hp.vessel_id,
    hp.department,
    hp.rank,
    f.id AS assessment_id,
    f.assessment_type,
    f.status,
    f.issued_on,
    f.expires_on,
    f.restrictions,
    (f.expires_on - CURRENT_DATE) AS days_remaining,
    CASE
      WHEN f.status IN ('unfit', 'temporarily_unfit') THEN 'unfit'
      WHEN f.expires_on IS NULL THEN 'unknown'
      WHEN f.expires_on < CURRENT_DATE THEN 'expired'
      WHEN f.expires_on <= CURRENT_DATE + 30 THEN 'expiring'
      WHEN f.status = 'fit_with_restrictions' THEN 'restricted'
      ELSE 'valid'
    END AS fitness_state
  FROM public.med_fitness_assessments f
  JOIN public.hw_people hp ON hp.id = f.person_id
  WHERE hp.is_active
  ORDER BY f.person_id, f.issued_on DESC NULLS LAST, f.created_at DESC;

-- ---------------------------------------------------------------
-- 3. hw_generate_alerts
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hw_generate_alerts(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item RECORD;
  v_count integer := 0;
  v_severity public.alert_severity;
  v_alert_type text;
  v_title text;
  v_existing uuid;
  v_window integer;
BEGIN
  FOR item IN
    SELECT e.*, COALESCE(s.fitness_expiry_warning_days, 90) AS warn_fitness,
           COALESCE(s.vaccination_warning_days, 60) AS warn_vaccination,
           COALESCE(s.stock_expiry_warning_days, 90) AS warn_stock,
           COALESCE(s.equipment_check_warning_days, 30) AS warn_equipment
    FROM public.hw_expiry_items e
    LEFT JOIN public.hw_settings s ON s.company_id = e.company_id
    WHERE (p_company_id IS NULL OR e.company_id = p_company_id)
  LOOP
    v_window := CASE item.item_type
      WHEN 'fitness' THEN item.warn_fitness
      WHEN 'vaccination' THEN item.warn_vaccination
      WHEN 'medical_stock' THEN item.warn_stock
      WHEN 'medical_equipment' THEN item.warn_equipment
      WHEN 'medical_equipment_service' THEN item.warn_equipment
      WHEN 'first_aid_kit' THEN item.warn_equipment
      ELSE 60
    END;

    CONTINUE WHEN item.days_remaining > v_window;

    v_severity := CASE
      WHEN item.days_remaining < 0 THEN 'RED'
      WHEN item.days_remaining <= 30 THEN 'ORANGE'
      ELSE 'YELLOW' END;
    v_alert_type := 'health_' || item.item_type;
    v_title := CASE
      WHEN item.days_remaining < 0
        THEN item.person_name || ': ' || item.label || ' overdue by ' || ABS(item.days_remaining) || ' days'
      ELSE item.person_name || ': ' || item.label || ' due in ' || item.days_remaining || ' days' END;

    SELECT id INTO v_existing FROM public.alerts
    WHERE company_id = item.company_id
      AND alert_type = v_alert_type
      AND related_entity_id = item.record_id
      AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.alerts
      SET title = v_title,
          severity_color = v_severity,
          due_at = item.due_date::timestamptz,
          metadata = jsonb_build_object('item_type', item.item_type, 'person_id', item.person_id, 'days_remaining', item.days_remaining),
          updated_at = now()
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.alerts (
        company_id, vessel_id, alert_type, title, description, severity_color, status,
        source_module, related_entity_type, related_entity_id, due_at, owner_role, metadata
      ) VALUES (
        item.company_id, item.vessel_id, v_alert_type, v_title,
        'Health item (' || item.label || ') due ' || to_char(item.due_date, 'DD Mon YYYY'),
        v_severity, 'OPEN', 'health', item.item_type, item.record_id,
        item.due_date::timestamptz, 'DPA',
        jsonb_build_object('item_type', item.item_type, 'person_id', item.person_id, 'days_remaining', item.days_remaining)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Close alerts whose item was renewed, completed or removed.
  UPDATE public.alerts a
  SET status = 'AUTO_DISMISSED', resolved_at = now(), updated_at = now()
  WHERE a.source_module = 'health'
    AND a.status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    AND (p_company_id IS NULL OR a.company_id = p_company_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.hw_expiry_items e
      WHERE e.record_id = a.related_entity_id AND e.days_remaining <= 90
    );

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.hw_generate_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hw_generate_alerts(uuid) TO service_role;

GRANT SELECT ON public.hw_expiry_items TO authenticated;
GRANT SELECT ON public.hw_fitness_status TO authenticated;

-- ---------------------------------------------------------------
-- 4. Notification types
-- ---------------------------------------------------------------
INSERT INTO public.notification_types (key, name, category, cadence, description, sort_order) VALUES
  ('health_fitness_expiring', 'Fitness Certificate Expiring', 'Health', 'weekly', 'ENG1 or equivalent fitness certificate expiring within the warning window', 60),
  ('health_vaccination_expiring', 'Vaccination Expiring', 'Health', 'weekly', 'A recorded vaccination is close to the end of its validity', 61),
  ('health_stock_expiring', 'Medical Stores Expiring', 'Health', 'weekly', 'Medical stores are close to their expiry date', 62),
  ('health_stock_low', 'Medical Stores Low', 'Health', 'daily', 'A medical stores item has fallen below its minimum quantity', 63),
  ('health_equipment_due', 'Medical Equipment Check Due', 'Health', 'weekly', 'Medical equipment or a first aid kit is due a check or service', 64),
  ('health_referral_open', 'Health Referral Awaiting Response', 'Health', 'daily', 'A referral between health disciplines has not been picked up', 65)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------
-- 5. Seeds
-- ---------------------------------------------------------------

-- Creates the MCA MSN 1768 Category A medical stores list for a vessel.
-- Idempotent on (vessel, item name).
CREATE OR REPLACE FUNCTION public.med_seed_msn1768_category_a(p_vessel_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id uuid;
  v_location_id uuid;
  v_count integer := 0;
  v_item record;
BEGIN
  SELECT company_id INTO v_company_id FROM public.vessels WHERE id = p_vessel_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'vessel % not found', p_vessel_id;
  END IF;
  IF NOT public.user_belongs_to_company(auth.uid(), v_company_id) OR NOT public.medical_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  SELECT id INTO v_location_id FROM public.med_supply_locations
  WHERE vessel_id = p_vessel_id AND category = 'hospital' LIMIT 1;
  IF v_location_id IS NULL THEN
    INSERT INTO public.med_supply_locations (company_id, vessel_id, name, category, description)
    VALUES (v_company_id, p_vessel_id, 'Ship''s hospital', 'hospital', 'Main medical store')
    RETURNING id INTO v_location_id;
  END IF;

  FOR v_item IN
    SELECT * FROM (VALUES
      ('Paracetamol 500mg', 'Analgesic', 'medicine', 'tablet', '500 mg', 'tablet', 100),
      ('Ibuprofen 400mg', 'NSAID analgesic', 'medicine', 'tablet', '400 mg', 'tablet', 100),
      ('Morphine sulfate 10mg/ml', 'Opioid analgesic', 'controlled_drug', 'ampoule', '10 mg/ml', 'ampoule', 10),
      ('Diazepam 5mg', 'Anxiolytic / anticonvulsant', 'controlled_drug', 'tablet', '5 mg', 'tablet', 20),
      ('Adrenaline 1:1000', 'Anaphylaxis', 'medicine', 'ampoule', '1 mg/ml', 'ampoule', 10),
      ('Chlorphenamine 4mg', 'Antihistamine', 'medicine', 'tablet', '4 mg', 'tablet', 50),
      ('Hydrocortisone 100mg', 'Corticosteroid', 'medicine', 'vial', '100 mg', 'vial', 5),
      ('Amoxicillin 500mg', 'Antibiotic', 'medicine', 'capsule', '500 mg', 'capsule', 60),
      ('Ciprofloxacin 500mg', 'Antibiotic', 'medicine', 'tablet', '500 mg', 'tablet', 30),
      ('Metronidazole 400mg', 'Antibiotic', 'medicine', 'tablet', '400 mg', 'tablet', 30),
      ('Glyceryl trinitrate spray', 'Angina', 'medicine', 'spray', '400 mcg', 'bottle', 2),
      ('Aspirin 300mg', 'Antiplatelet', 'medicine', 'tablet', '300 mg', 'tablet', 30),
      ('Salbutamol inhaler', 'Bronchodilator', 'medicine', 'inhaler', '100 mcg', 'inhaler', 4),
      ('Ondansetron 4mg', 'Antiemetic', 'medicine', 'tablet', '4 mg', 'tablet', 30),
      ('Hyoscine hydrobromide', 'Motion sickness', 'medicine', 'tablet', '300 mcg', 'tablet', 50),
      ('Loperamide 2mg', 'Antidiarrhoeal', 'medicine', 'capsule', '2 mg', 'capsule', 50),
      ('Oral rehydration salts', 'Rehydration', 'medicine', 'sachet', NULL, 'sachet', 50),
      ('Omeprazole 20mg', 'Proton pump inhibitor', 'medicine', 'capsule', '20 mg', 'capsule', 30),
      ('Sodium chloride 0.9% 500ml', 'IV fluid', 'medicine', 'bag', '0.9%', 'bag', 10),
      ('Lidocaine 1%', 'Local anaesthetic', 'medicine', 'vial', '1%', 'vial', 10),
      ('Naloxone 400mcg', 'Opioid antidote', 'antidote', 'ampoule', '400 mcg/ml', 'ampoule', 5),
      ('Activated charcoal', 'Poisoning', 'antidote', 'suspension', '50 g', 'bottle', 2),
      ('Chlorhexidine 0.05%', 'Antiseptic', 'medicine', 'solution', '0.05%', 'bottle', 5),
      ('Silver sulfadiazine cream', 'Burns', 'medicine', 'cream', '1%', 'tube', 5),
      ('Sterile gauze swabs', 'Dressing', 'dressing', 'pack', NULL, 'pack', 50),
      ('Crepe bandage 7.5cm', 'Dressing', 'dressing', 'roll', '7.5 cm', 'roll', 20),
      ('Triangular bandage', 'Dressing', 'dressing', 'unit', NULL, 'unit', 10),
      ('Burn dressing 10x10cm', 'Dressing', 'dressing', 'unit', '10x10 cm', 'unit', 10),
      ('Adhesive plasters assorted', 'Dressing', 'dressing', 'box', NULL, 'box', 5),
      ('Suture kit 3/0', 'Wound closure', 'instrument', 'kit', '3/0', 'kit', 10),
      ('Steri-strips', 'Wound closure', 'dressing', 'pack', NULL, 'pack', 20),
      ('Disposable scalpel', 'Instrument', 'instrument', 'unit', NULL, 'unit', 10),
      ('Cervical collar', 'Immobilisation', 'instrument', 'unit', 'adjustable', 'unit', 2),
      ('SAM splint', 'Immobilisation', 'instrument', 'unit', NULL, 'unit', 4),
      ('Tourniquet', 'Haemorrhage control', 'instrument', 'unit', NULL, 'unit', 4),
      ('Nitrile gloves', 'PPE', 'ppe', 'box', 'medium', 'box', 10),
      ('Surgical masks', 'PPE', 'ppe', 'box', NULL, 'box', 10),
      ('FFP3 respirator', 'PPE', 'ppe', 'unit', NULL, 'unit', 20),
      ('Digital thermometer', 'Diagnostic', 'diagnostic', 'unit', NULL, 'unit', 2),
      ('Blood pressure cuff', 'Diagnostic', 'diagnostic', 'unit', NULL, 'unit', 2),
      ('Pulse oximeter', 'Diagnostic', 'diagnostic', 'unit', NULL, 'unit', 2),
      ('Blood glucose meter and strips', 'Diagnostic', 'diagnostic', 'kit', NULL, 'kit', 1),
      ('Urine dipsticks', 'Diagnostic', 'diagnostic', 'pack', NULL, 'pack', 2),
      ('Sharps container', 'Waste', 'consumable', 'unit', '1 litre', 'unit', 4)
    ) AS t(name, generic_name, category, form, strength, unit, minimum_quantity)
  LOOP
    INSERT INTO public.med_supply_items (
      company_id, vessel_id, location_id, name, generic_name, category, msn_category,
      form, strength, unit, quantity, minimum_quantity, is_controlled, created_by
    )
    SELECT
      v_company_id, p_vessel_id, v_location_id, v_item.name, v_item.generic_name,
      v_item.category, 'A', v_item.form, v_item.strength, v_item.unit,
      0, v_item.minimum_quantity, v_item.category = 'controlled_drug', auth.uid()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.med_supply_items existing
      WHERE existing.vessel_id = p_vessel_id AND existing.name = v_item.name
    );
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.med_seed_msn1768_category_a(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.med_seed_msn1768_category_a(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.med_seed_msn1768_category_a IS 'Creates a starter Category A medical stores list based on MCA MSN 1768. Quantities start at zero: the medic counts stock in. Review against the vessel flag requirement before relying on it.';

-- Creates the default crew health screening template for a company.
CREATE OR REPLACE FUNCTION public.med_seed_screening_template(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_template_id uuid;
  q record;
BEGIN
  IF NOT public.user_belongs_to_company(auth.uid(), p_company_id) OR NOT public.medical_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  SELECT id INTO v_template_id FROM public.med_screening_templates
  WHERE company_id = p_company_id AND code = 'CHEK-1';
  IF v_template_id IS NOT NULL THEN
    RETURN v_template_id;
  END IF;

  INSERT INTO public.med_screening_templates (
    company_id, name, code, description, category, status, scoring_mode,
    review_interval_months, is_self_serve, interpretation, created_by
  ) VALUES (
    p_company_id, 'Crew Health Appraisal', 'CHEK-1',
    'Holistic health appraisal covering lifestyle, sleep, stress, movement and nutrition. Edit the questions to match your programme.',
    'general', 'active', 'sum', 12, true,
    'Score 0-15 low risk, 16-30 moderate, 31-45 high, 46+ very high. Review any flagged answer with the crew member.',
    auth.uid()
  ) RETURNING id INTO v_template_id;

  FOR q IN
    SELECT * FROM (VALUES
      ('Lifestyle', 1, 'How many hours of sleep do you average per night?', 'number', 3, 'hours'),
      ('Lifestyle', 2, 'How would you rate your sleep quality?', 'scale', 3, NULL),
      ('Lifestyle', 3, 'How many units of alcohol do you drink in a typical week?', 'number', 2, 'units'),
      ('Lifestyle', 4, 'Do you smoke or vape?', 'yes_no', 3, NULL),
      ('Stress', 5, 'How would you rate your stress level on board?', 'scale', 3, NULL),
      ('Stress', 6, 'Do you feel able to switch off when off watch?', 'yes_no', 2, NULL),
      ('Stress', 7, 'Have you felt low or anxious for most of the last two weeks?', 'yes_no', 4, NULL),
      ('Movement', 8, 'How many days a week do you train or exercise?', 'number', 2, 'days'),
      ('Movement', 9, 'Do you have any pain that limits your work?', 'yes_no', 4, NULL),
      ('Movement', 10, 'Rate your energy through a normal working day', 'scale', 2, NULL),
      ('Nutrition', 11, 'How many portions of fruit and vegetables do you eat daily?', 'number', 2, 'portions'),
      ('Nutrition', 12, 'How much water do you drink in a typical day?', 'number', 2, 'litres'),
      ('Nutrition', 13, 'Do you take any supplements?', 'text', 1, NULL),
      ('Occupational', 14, 'Does your cabin allow you to rest properly?', 'yes_no', 2, NULL),
      ('Occupational', 15, 'Any concerns you would like the medic to know about?', 'text', 1, NULL)
    ) AS t(section, position, prompt, answer_type, weight, unit)
  LOOP
    INSERT INTO public.med_screening_questions (
      company_id, template_id, section, position, prompt, answer_type, weight, unit,
      min_value, max_value, is_required
    ) VALUES (
      p_company_id, v_template_id, q.section, q.position, q.prompt, q.answer_type, q.weight, q.unit,
      CASE WHEN q.answer_type = 'scale' THEN 1 ELSE NULL END,
      CASE WHEN q.answer_type = 'scale' THEN 5 ELSE NULL END,
      q.answer_type <> 'text'
    );
  END LOOP;

  RETURN v_template_id;
END;
$$;
REVOKE ALL ON FUNCTION public.med_seed_screening_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.med_seed_screening_template(uuid) TO authenticated, service_role;

-- Creates the default spa treatment menu for a company.
CREATE OR REPLACE FUNCTION public.spa_seed_treatment_menu(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
  t record;
BEGIN
  IF NOT public.user_belongs_to_company(auth.uid(), p_company_id) OR NOT public.wellness_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  FOR t IN
    SELECT * FROM (VALUES
      ('Swedish massage', 'massage', 60),
      ('Deep tissue massage', 'massage', 60),
      ('Sports massage', 'massage', 45),
      ('Hot stone massage', 'massage', 90),
      ('Aromatherapy massage', 'massage', 75),
      ('Reflexology', 'massage', 45),
      ('Express facial', 'facial', 30),
      ('Signature facial', 'facial', 60),
      ('Body scrub', 'body', 45),
      ('Body wrap', 'body', 60),
      ('Manicure', 'nail', 45),
      ('Pedicure', 'nail', 60),
      ('Blow dry', 'hair', 45),
      ('Hydrotherapy circuit', 'hydrotherapy', 60),
      ('Sauna session', 'sauna', 30),
      ('Stretch and mobility session', 'fitness', 30)
    ) AS t(name, category, duration_minutes)
  LOOP
    INSERT INTO public.spa_treatments (company_id, name, category, duration_minutes, created_by)
    SELECT p_company_id, t.name, t.category, t.duration_minutes, auth.uid()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.spa_treatments existing
      WHERE existing.company_id = p_company_id AND existing.name = t.name
    );
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.spa_seed_treatment_menu(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spa_seed_treatment_menu(uuid) TO authenticated, service_role;

-- Registers the exercise import connectors for a company.
CREATE OR REPLACE FUNCTION public.pt_seed_exercise_sources(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.user_belongs_to_company(auth.uid(), p_company_id) OR NOT public.wellness_can_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  INSERT INTO public.pt_exercise_sources (company_id, source_key, label, base_url, licence, attribution, is_enabled, notes)
  VALUES
    (p_company_id, 'wger', 'wger', 'https://wger.de/api/v2', 'CC-BY-SA 4.0',
     'Exercise data from wger.de, licensed CC-BY-SA 4.0', true,
     'Open API, no key required.'),
    (p_company_id, 'exercisedb', 'ExerciseDB API', 'https://exercisedb.p.rapidapi.com', 'Commercial',
     'ExerciseDB via RapidAPI', false,
     'Needs a RapidAPI key in the credential field.'),
    (p_company_id, 'exercisedb_import', 'ExerciseDB Import', NULL, 'Commercial',
     'ExerciseDB export file', false,
     'Upload a JSON or CSV export rather than calling the API.'),
    (p_company_id, 'musclewiki', 'MuscleWiki', 'https://musclewiki.com', 'All rights reserved',
     'MuscleWiki', false,
     'No public API. Import a file you are licensed to use.'),
    (p_company_id, 'anatomytool', 'AnatomyTOOL', 'https://anatomytool.org', 'CC-BY-NC-SA (varies per item)',
     'AnatomyTOOL, Leiden University', false,
     'No public API. Import a file; check the licence of each image.'),
    (p_company_id, 'z_anatomy', 'Z-Anatomy', 'https://www.z-anatomy.com', 'CC-BY-SA 4.0',
     'Z-Anatomy', false,
     'No public API. Import a file.')
  ON CONFLICT (company_id, source_key) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.pt_seed_exercise_sources(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pt_seed_exercise_sources(uuid) TO authenticated, service_role;
