-- =================================================================
-- HEALTH & WELLNESS PHASE 2: MEDICAL
-- =================================================================
--  1. hw_practitioner_qualifications (all disciplines)
--  2. med_patient_records      — clinical summary per subject
--  3. med_allergies / med_conditions / med_medications / med_vaccinations
--  4. med_fitness_assessments  — ENG1 / fitness to work (non-clinical)
--  5. med_consultations        — treatment and consultation log
--  6. med_supply_locations / med_supply_items / med_supply_transactions
--  7. med_equipment / med_first_aid_kits / med_kit_checks
--  8. med_protocols / med_protocol_acknowledgements
--  9. med_log_entries          — fridge temps, daily checks, sharps, oxygen
-- 10. med_screening_*          — configurable health screening (C.H.E.K.)
-- 11. Retention registration, stock engine, alert-facing views
--
-- Clinical tables are gated on medical_can_*; the subject always reads
-- their own record. Fitness to work is deliberately separate so captains
-- and HR can see "fit / not fit / expires" without any clinical detail.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. Practitioner qualifications
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hw_practitioner_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  practitioner_id uuid NOT NULL REFERENCES public.hw_practitioners(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text CHECK (category IS NULL OR category IN ('medical','first_aid','fitness','therapy','nutrition','safety','other')),
  issuing_authority text,
  reference text,
  issue_date date,
  expiry_date date,
  document_path text,
  document_name text,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hw_pract_quals_practitioner ON public.hw_practitioner_qualifications(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_hw_pract_quals_expiry ON public.hw_practitioner_qualifications(company_id, expiry_date);

-- ---------------------------------------------------------------
-- 2. med_patient_records — one clinical summary per subject
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_patient_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL UNIQUE REFERENCES public.hw_people(id) ON DELETE CASCADE,
  blood_group text CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  height_cm numeric(6,2),
  weight_kg numeric(6,2),
  organ_donor boolean,
  gp_name text,
  gp_contact text,
  insurance_provider text,
  insurance_policy_number text,
  insurance_contact text,
  medical_history text,
  surgical_history text,
  family_history text,
  smoker text CHECK (smoker IS NULL OR smoker IN ('never','former','current')),
  alcohol_units_week integer,
  -- Free-text flag shown at the top of the record and on the emergency card.
  critical_alert text,
  last_reviewed_on date,
  last_reviewed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_patient_records_company ON public.med_patient_records(company_id);

-- ---------------------------------------------------------------
-- 3. Clinical detail
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  allergen text NOT NULL,
  allergy_type text NOT NULL DEFAULT 'other' CHECK (allergy_type IN ('food','drug','environmental','insect','latex','other')),
  severity text NOT NULL DEFAULT 'moderate' CHECK (severity IN ('mild','moderate','severe','anaphylaxis')),
  reaction text,
  treatment text,
  carries_autoinjector boolean NOT NULL DEFAULT false,
  diagnosed_on date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_allergies_person ON public.med_allergies(person_id, is_active);

COMMENT ON TABLE public.med_allergies IS 'Allergies. Readable by wellness staff (galley, spa) when the subject consents via hw_people.consent_share_safety_flags, because the galley must know what not to serve.';

CREATE TABLE IF NOT EXISTS public.med_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  condition_name text NOT NULL,
  category text CHECK (category IS NULL OR category IN ('cardiac','respiratory','musculoskeletal','neurological','endocrine','mental_health','dermatological','gastrointestinal','other')),
  severity text CHECK (severity IS NULL OR severity IN ('mild','moderate','severe')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','managed','resolved')),
  diagnosed_on date,
  resolved_on date,
  treatment_summary text,
  affects_fitness boolean NOT NULL DEFAULT false,
  requires_medication boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_conditions_person ON public.med_conditions(person_id, status);

CREATE TABLE IF NOT EXISTS public.med_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  medication_name text NOT NULL,
  dosage text,
  frequency text,
  route text CHECK (route IS NULL OR route IN ('oral','topical','injection','inhaled','nasal','rectal','ophthalmic','other')),
  reason text,
  prescriber text,
  start_date date,
  end_date date,
  is_regular boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  supply_item_id uuid,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_medications_person ON public.med_medications(person_id, is_active);

CREATE TABLE IF NOT EXISTS public.med_vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  vaccine text NOT NULL,
  dose_label text,
  administered_on date,
  valid_from date,
  valid_until date,
  batch_number text,
  administered_by text,
  site text,
  is_required boolean NOT NULL DEFAULT false,
  exemption_reason text,
  certificate_path text,
  certificate_name text,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_vaccinations_person ON public.med_vaccinations(person_id);
CREATE INDEX IF NOT EXISTS idx_med_vaccinations_expiry ON public.med_vaccinations(company_id, valid_until);

-- ---------------------------------------------------------------
-- 4. med_fitness_assessments — fitness to work / ENG1
--    Administrative only. No diagnosis, no medication, no notes that
--    would breach confidentiality: captains and HR read this table.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_fitness_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assessment_type text NOT NULL DEFAULT 'eng1'
    CHECK (assessment_type IN ('eng1','ml5','company','return_to_work','pre_employment','periodic','other')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('fit','fit_with_restrictions','temporarily_unfit','unfit','pending','expired')),
  issued_on date,
  expires_on date,
  examiner_name text,
  examiner_reference text,
  issuing_country text,
  restrictions text,
  restriction_review_on date,
  -- Links the paperwork to the existing crew certificate so the HRIS
  -- compliance strip and certificate alerts keep working unchanged.
  certificate_id uuid REFERENCES public.crew_certificates(id) ON DELETE SET NULL,
  document_path text,
  document_name text,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_fitness_person ON public.med_fitness_assessments(person_id, expires_on DESC);
CREATE INDEX IF NOT EXISTS idx_med_fitness_expiry ON public.med_fitness_assessments(company_id, expires_on);

COMMENT ON TABLE public.med_fitness_assessments IS 'Fitness to work. Readable by medical staff, HR, captains and fleet masters. Never record diagnosis here — clinical detail belongs in med_consultations.';

-- ---------------------------------------------------------------
-- 5. med_consultations — treatment / consultation log
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  consultation_number text NOT NULL,
  parent_consultation_id uuid REFERENCES public.med_consultations(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  location text,
  consultation_type text NOT NULL DEFAULT 'walk_in'
    CHECK (consultation_type IN ('walk_in','scheduled','emergency','follow_up','screening','telemedicine')),
  presenting_complaint text,
  history text,
  observations text,
  temperature_c numeric(4,1),
  pulse_bpm integer,
  respiratory_rate integer,
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  oxygen_saturation integer,
  pain_score integer CHECK (pain_score IS NULL OR (pain_score >= 0 AND pain_score <= 10)),
  assessment text,
  treatment_given text,
  medication_given text,
  outcome text NOT NULL DEFAULT 'resolved'
    CHECK (outcome IN ('resolved','monitoring','referred_physio','referred_shoreside','referred_specialist','medevac','hospitalised','deceased','other')),
  fit_for_duty text CHECK (fit_for_duty IS NULL OR fit_for_duty IN ('fit','light_duties','unfit')),
  days_off_work integer CHECK (days_off_work IS NULL OR days_off_work >= 0),
  follow_up_on date,
  telemedicine_used boolean NOT NULL DEFAULT false,
  telemedicine_provider text,
  telemedicine_case_ref text,
  attended_by_practitioner_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  is_work_related boolean NOT NULL DEFAULT false,
  is_confidential boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_consultations_person ON public.med_consultations(person_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_med_consultations_company ON public.med_consultations(company_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_med_consultations_number ON public.med_consultations(company_id, consultation_number);

ALTER TABLE public.hw_referrals
  DROP CONSTRAINT IF EXISTS hw_referrals_consultation_id_fkey;
ALTER TABLE public.hw_referrals
  ADD CONSTRAINT hw_referrals_consultation_id_fkey
  FOREIGN KEY (consultation_id) REFERENCES public.med_consultations(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 6. Medical stores
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_supply_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('hospital','dispensary','bridge','engine_room','tender','grab_bag','liferaft','cabin','gym','dive','other')),
  description text,
  is_controlled_store boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_supply_locations_company ON public.med_supply_locations(company_id, vessel_id, is_active);

CREATE TABLE IF NOT EXISTS public.med_supply_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.med_supply_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  generic_name text,
  category text NOT NULL DEFAULT 'medicine'
    CHECK (category IN ('medicine','controlled_drug','consumable','dressing','instrument','antidote','ppe','diagnostic','other')),
  msn_category text CHECK (msn_category IS NULL OR msn_category IN ('A','B','C')),
  form text,
  strength text,
  unit text NOT NULL DEFAULT 'unit',
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  minimum_quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  batch_number text,
  expiry_date date,
  supplier text,
  order_reference text,
  storage_requirements text,
  is_controlled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_checked_on date,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_supply_items_company ON public.med_supply_items(company_id, vessel_id, is_active);
CREATE INDEX IF NOT EXISTS idx_med_supply_items_expiry ON public.med_supply_items(company_id, expiry_date);

ALTER TABLE public.med_medications
  DROP CONSTRAINT IF EXISTS med_medications_supply_item_id_fkey;
ALTER TABLE public.med_medications
  ADD CONSTRAINT med_medications_supply_item_id_fkey
  FOREIGN KEY (supply_item_id) REFERENCES public.med_supply_items(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.med_supply_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.med_supply_items(id) ON DELETE CASCADE,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('receipt','issue','disposal','adjustment','transfer','stock_check','return')),
  quantity_delta numeric(12,2) NOT NULL,
  quantity_after numeric(12,2),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  person_id uuid REFERENCES public.hw_people(id) ON DELETE SET NULL,
  consultation_id uuid REFERENCES public.med_consultations(id) ON DELETE SET NULL,
  destination_location_id uuid REFERENCES public.med_supply_locations(id) ON DELETE SET NULL,
  batch_number text,
  expiry_date date,
  -- Controlled drugs: a second named person must witness every movement.
  witnessed_by_practitioner_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  witness_name text,
  performed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_supply_tx_item ON public.med_supply_transactions(item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_med_supply_tx_company ON public.med_supply_transactions(company_id, occurred_at DESC);

-- ---------------------------------------------------------------
-- 7. Equipment and first aid kits
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.med_supply_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  equipment_type text NOT NULL DEFAULT 'other'
    CHECK (equipment_type IN ('aed','defibrillator','oxygen','suction','ventilator','monitor','stretcher','spinal_board','nebuliser','diagnostic','dental','other')),
  manufacturer text,
  model text,
  serial_number text,
  asset_reference text,
  commissioned_on date,
  last_service_on date,
  next_service_due date,
  last_check_on date,
  next_check_due date,
  check_interval_days integer CHECK (check_interval_days IS NULL OR check_interval_days > 0),
  consumable_expiry date,
  status text NOT NULL DEFAULT 'operational'
    CHECK (status IN ('operational','defective','out_of_service','in_service','awaiting_parts','retired')),
  defect_notes text,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_equipment_company ON public.med_equipment(company_id, vessel_id, status);
CREATE INDEX IF NOT EXISTS idx_med_equipment_due ON public.med_equipment(company_id, next_check_due);

CREATE TABLE IF NOT EXISTS public.med_first_aid_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.med_supply_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  kit_type text NOT NULL DEFAULT 'general'
    CHECK (kit_type IN ('general','grab_bag','tender','dive','burns','trauma','bridge','engine_room','galley','sports','other')),
  seal_number text,
  contents_reference text,
  last_inspection_on date,
  next_inspection_due date,
  inspection_interval_days integer NOT NULL DEFAULT 90 CHECK (inspection_interval_days > 0),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','incomplete','expired','missing','in_use')),
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_kits_company ON public.med_first_aid_kits(company_id, vessel_id, status);
CREATE INDEX IF NOT EXISTS idx_med_kits_due ON public.med_first_aid_kits(company_id, next_inspection_due);

CREATE TABLE IF NOT EXISTS public.med_kit_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kit_id uuid REFERENCES public.med_first_aid_kits(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES public.med_equipment(id) ON DELETE CASCADE,
  checked_on date NOT NULL DEFAULT CURRENT_DATE,
  checked_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  checked_by_name text,
  result text NOT NULL DEFAULT 'pass' CHECK (result IN ('pass','pass_with_actions','fail')),
  findings text,
  actions text,
  items_replaced text,
  next_due date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT med_kit_checks_target CHECK (kit_id IS NOT NULL OR equipment_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_med_kit_checks_kit ON public.med_kit_checks(kit_id, checked_on DESC);
CREATE INDEX IF NOT EXISTS idx_med_kit_checks_equipment ON public.med_kit_checks(equipment_id, checked_on DESC);

-- ---------------------------------------------------------------
-- 8. Protocols
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  title text NOT NULL,
  reference text,
  category text NOT NULL DEFAULT 'clinical'
    CHECK (category IN ('emergency','clinical','medication','evacuation','infection_control','mental_health','dental','hygiene','other')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  summary text,
  content text,
  document_path text,
  document_name text,
  effective_from date,
  review_due date,
  approved_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  approved_at timestamptz,
  requires_acknowledgement boolean NOT NULL DEFAULT false,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_protocols_company ON public.med_protocols(company_id, status, category);

CREATE TABLE IF NOT EXISTS public.med_protocol_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  protocol_id uuid NOT NULL REFERENCES public.med_protocols(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (protocol_id, profile_id, version)
);
CREATE INDEX IF NOT EXISTS idx_med_protocol_acks_protocol ON public.med_protocol_acknowledgements(protocol_id);

-- ---------------------------------------------------------------
-- 9. Log entries (fridge temperature, daily checks, sharps, oxygen)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  log_type text NOT NULL
    CHECK (log_type IN ('fridge_temperature','daily_check','weekly_check','sharps','oxygen','defibrillator','waste','cleaning','telemedicine','handover','other')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  recorded_by_name text,
  location_id uuid REFERENCES public.med_supply_locations(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES public.med_equipment(id) ON DELETE SET NULL,
  value_numeric numeric(10,2),
  value_unit text,
  value_text text,
  within_limits boolean,
  action_taken text,
  witnessed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_logs_company ON public.med_log_entries(company_id, log_type, recorded_at DESC);

-- ---------------------------------------------------------------
-- 10. Health screening programme (C.H.E.K.)
--     Configurable questionnaire templates with scored sections, run as
--     campaigns against the crew. Holds a holistic health appraisal or
--     any other screening programme without a schema change.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.med_screening_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','lifestyle','posture','nutrition','mental_health','cardiovascular','musculoskeletal','occupational','other')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  scoring_mode text NOT NULL DEFAULT 'sum' CHECK (scoring_mode IN ('sum','average','none')),
  interpretation text,
  review_interval_months integer CHECK (review_interval_months IS NULL OR review_interval_months > 0),
  is_self_serve boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_screening_templates_company ON public.med_screening_templates(company_id, status);

CREATE TABLE IF NOT EXISTS public.med_screening_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.med_screening_templates(id) ON DELETE CASCADE,
  section text NOT NULL DEFAULT 'General',
  position integer NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  help_text text,
  answer_type text NOT NULL DEFAULT 'scale'
    CHECK (answer_type IN ('scale','yes_no','number','text','single_choice','multi_choice','date')),
  options text[] NOT NULL DEFAULT '{}',
  min_value numeric(10,2),
  max_value numeric(10,2),
  unit text,
  weight numeric(6,2) NOT NULL DEFAULT 1,
  flag_when text,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_screening_questions_template ON public.med_screening_questions(template_id, position);

CREATE TABLE IF NOT EXISTS public.med_screening_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.med_screening_templates(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  template_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','in_progress','submitted','reviewed','actioned','cancelled')),
  invited_on date,
  due_on date,
  completed_on date,
  reviewed_on date,
  reviewed_by_practitioner_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  total_score numeric(10,2),
  risk_band text CHECK (risk_band IS NULL OR risk_band IN ('low','moderate','high','very_high')),
  summary text,
  recommendations text,
  follow_up_on date,
  referral_id uuid REFERENCES public.hw_referrals(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_med_screening_records_person ON public.med_screening_records(person_id, status);
CREATE INDEX IF NOT EXISTS idx_med_screening_records_company ON public.med_screening_records(company_id, status, due_on);

CREATE TABLE IF NOT EXISTS public.med_screening_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  record_id uuid NOT NULL REFERENCES public.med_screening_records(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.med_screening_questions(id) ON DELETE CASCADE,
  value_numeric numeric(10,2),
  value_text text,
  value_options text[] NOT NULL DEFAULT '{}',
  value_date date,
  is_flagged boolean NOT NULL DEFAULT false,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_med_screening_answers_record ON public.med_screening_answers(record_id);

-- ---------------------------------------------------------------
-- 11. Engines
-- ---------------------------------------------------------------

-- Consultation numbers: MC-<year>-<sequence within company and year>.
CREATE OR REPLACE FUNCTION public.med_consultation_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year text := to_char(COALESCE(NEW.occurred_at, now()), 'YYYY');
  v_seq integer;
BEGIN
  IF NEW.consultation_number IS NOT NULL AND NEW.consultation_number <> '' THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.med_consultations
  WHERE company_id = NEW.company_id
    AND consultation_number LIKE 'MC-' || v_year || '-%';
  NEW.consultation_number := 'MC-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_med_consultations_number ON public.med_consultations;
CREATE TRIGGER trg_med_consultations_number BEFORE INSERT ON public.med_consultations
  FOR EACH ROW EXECUTE FUNCTION public.med_consultation_number();

-- Stock engine: every transaction moves the item's quantity and records
-- the resulting balance. Controlled drugs need a named witness.
CREATE OR REPLACE FUNCTION public.med_supply_apply_transaction()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.med_supply_items;
  v_requires_witness boolean;
  v_new_quantity numeric(12,2);
BEGIN
  SELECT * INTO v_item FROM public.med_supply_items WHERE id = NEW.item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'medical stores item % not found', NEW.item_id;
  END IF;

  SELECT COALESCE(s.controlled_drugs_require_witness, true) INTO v_requires_witness
  FROM public.hw_settings s WHERE s.company_id = NEW.company_id;
  v_requires_witness := COALESCE(v_requires_witness, true);

  IF v_item.is_controlled
     AND v_requires_witness
     AND NEW.transaction_type IN ('issue','disposal','adjustment')
     AND NEW.witnessed_by_practitioner_id IS NULL
     AND COALESCE(btrim(NEW.witness_name), '') = '' THEN
    RAISE EXCEPTION 'A witness is required for controlled drug movements';
  END IF;

  IF NEW.transaction_type = 'stock_check' THEN
    -- A stock check states the counted quantity in quantity_delta.
    v_new_quantity := NEW.quantity_delta;
    NEW.quantity_delta := v_new_quantity - v_item.quantity;
  ELSE
    v_new_quantity := v_item.quantity + NEW.quantity_delta;
  END IF;

  IF v_new_quantity < 0 THEN
    RAISE EXCEPTION 'Medical stores cannot go negative (% would become %)', v_item.name, v_new_quantity;
  END IF;

  NEW.quantity_after := v_new_quantity;

  UPDATE public.med_supply_items
  SET quantity = v_new_quantity,
      last_checked_on = CASE WHEN NEW.transaction_type = 'stock_check' THEN CURRENT_DATE ELSE last_checked_on END,
      batch_number = COALESCE(NEW.batch_number, batch_number),
      expiry_date = COALESCE(NEW.expiry_date, expiry_date),
      updated_at = now()
  WHERE id = NEW.item_id;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_med_supply_tx ON public.med_supply_transactions;
CREATE TRIGGER trg_med_supply_tx BEFORE INSERT ON public.med_supply_transactions
  FOR EACH ROW EXECUTE FUNCTION public.med_supply_apply_transaction();

-- Kit and equipment checks roll the next due date forward.
CREATE OR REPLACE FUNCTION public.med_kit_check_after_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kit_id IS NOT NULL THEN
    UPDATE public.med_first_aid_kits k
    SET last_inspection_on = NEW.checked_on,
        next_inspection_due = COALESCE(NEW.next_due, (NEW.checked_on + make_interval(days => k.inspection_interval_days))::date),
        status = CASE NEW.result WHEN 'fail' THEN 'incomplete' WHEN 'pass_with_actions' THEN 'incomplete' ELSE 'ready' END,
        updated_at = now()
    WHERE k.id = NEW.kit_id;
  END IF;

  IF NEW.equipment_id IS NOT NULL THEN
    UPDATE public.med_equipment e
    SET last_check_on = NEW.checked_on,
        next_check_due = COALESCE(NEW.next_due,
          CASE WHEN e.check_interval_days IS NOT NULL
               THEN (NEW.checked_on + make_interval(days => e.check_interval_days))::date
               ELSE e.next_check_due END),
        status = CASE WHEN NEW.result = 'fail' THEN 'defective' ELSE e.status END,
        defect_notes = CASE WHEN NEW.result = 'fail' THEN COALESCE(NEW.findings, e.defect_notes) ELSE e.defect_notes END,
        updated_at = now()
    WHERE e.id = NEW.equipment_id;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_med_kit_checks_after ON public.med_kit_checks;
CREATE TRIGGER trg_med_kit_checks_after AFTER INSERT ON public.med_kit_checks
  FOR EACH ROW EXECUTE FUNCTION public.med_kit_check_after_insert();

-- Fitness assessments mirror their expiry onto profiles.medical_expiry so
-- the crew list, certificate alerts and HRIS compliance strip stay right.
CREATE OR REPLACE FUNCTION public.med_fitness_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid;
  v_latest date;
BEGIN
  SELECT COALESCE(NEW.profile_id, hp.profile_id) INTO v_profile_id
  FROM public.hw_people hp WHERE hp.id = NEW.person_id;

  IF v_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MAX(f.expires_on) INTO v_latest
  FROM public.med_fitness_assessments f
  WHERE f.person_id = NEW.person_id
    AND f.status IN ('fit', 'fit_with_restrictions')
    AND f.expires_on IS NOT NULL;

  UPDATE public.profiles SET medical_expiry = v_latest, updated_at = now()
  WHERE id = v_profile_id AND medical_expiry IS DISTINCT FROM v_latest;

  PERFORM public.hr_register_record(
    NEW.company_id, v_profile_id, 'medical_record'::public.hr_record_type,
    NEW.id, 'med_fitness_assessments', COALESCE(NEW.issued_on, CURRENT_DATE)
  );

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_med_fitness_after ON public.med_fitness_assessments;
CREATE TRIGGER trg_med_fitness_after AFTER INSERT OR UPDATE ON public.med_fitness_assessments
  FOR EACH ROW EXECUTE FUNCTION public.med_fitness_after_write();

-- Retention: every clinical record is registered as a medical_record.
CREATE OR REPLACE FUNCTION public.med_register_clinical_record()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT hp.profile_id INTO v_profile_id FROM public.hw_people hp WHERE hp.id = NEW.person_id;
  PERFORM public.hr_register_record(
    NEW.company_id, v_profile_id, 'medical_record'::public.hr_record_type,
    NEW.id, TG_TABLE_NAME, CURRENT_DATE
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_med_consultations_register ON public.med_consultations;
CREATE TRIGGER trg_med_consultations_register AFTER INSERT ON public.med_consultations
  FOR EACH ROW EXECUTE FUNCTION public.med_register_clinical_record();
DROP TRIGGER IF EXISTS trg_med_patient_records_register ON public.med_patient_records;
CREATE TRIGGER trg_med_patient_records_register AFTER INSERT ON public.med_patient_records
  FOR EACH ROW EXECUTE FUNCTION public.med_register_clinical_record();
DROP TRIGGER IF EXISTS trg_med_screening_records_register ON public.med_screening_records;
CREATE TRIGGER trg_med_screening_records_register AFTER INSERT ON public.med_screening_records
  FOR EACH ROW EXECUTE FUNCTION public.med_register_clinical_record();

-- ---------------------------------------------------------------
-- 12. Row level security
-- ---------------------------------------------------------------

-- Clinical tables: medical staff, or the subject reading their own record.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'med_patient_records','med_conditions','med_medications','med_vaccinations','med_consultations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.medical_can_view(auth.uid())
          OR public.hw_person_is_self(auth.uid(), person_id)
        )
      )$f$, t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND public.medical_can_edit(auth.uid())
      ) WITH CHECK (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND public.medical_can_edit(auth.uid())
      )$f$, t || '_write', t);
  END LOOP;
END $$;

-- Allergies: also visible to wellness staff when the subject consents,
-- because the galley and the gym need to know.
ALTER TABLE public.med_allergies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_allergies_select" ON public.med_allergies;
CREATE POLICY "med_allergies_select" ON public.med_allergies
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.medical_can_view(auth.uid())
      OR public.hw_person_is_self(auth.uid(), person_id)
      OR (
        public.wellness_can_view(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.hw_people hp
          WHERE hp.id = med_allergies.person_id AND hp.consent_share_safety_flags
        )
      )
    )
  );
DROP POLICY IF EXISTS "med_allergies_write" ON public.med_allergies;
CREATE POLICY "med_allergies_write" ON public.med_allergies
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  );

-- Fitness to work: medical staff, HR, captains, fleet masters and the subject.
ALTER TABLE public.med_fitness_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_fitness_select" ON public.med_fitness_assessments;
CREATE POLICY "med_fitness_select" ON public.med_fitness_assessments
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.med_fitness_can_view(auth.uid())
      OR public.hw_person_is_self(auth.uid(), person_id)
    )
  );
DROP POLICY IF EXISTS "med_fitness_write" ON public.med_fitness_assessments;
CREATE POLICY "med_fitness_write" ON public.med_fitness_assessments
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.medical_can_edit(auth.uid()) OR public.hr_can_edit(auth.uid()))
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.medical_can_edit(auth.uid()) OR public.hr_can_edit(auth.uid()))
  );

-- Stores, equipment, kits, logs: operational, not clinical. Visible to
-- medical staff and to officers who have to verify them in an audit.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'med_supply_locations','med_supply_items','med_equipment','med_first_aid_kits'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (public.medical_can_view(auth.uid()) OR public.wellness_can_view(auth.uid()))
      )$f$, t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND public.medical_can_edit(auth.uid())
      ) WITH CHECK (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND public.medical_can_edit(auth.uid())
      )$f$, t || '_write', t);
  END LOOP;
END $$;

-- med_log_entries is the same operational loop, except that two of its log
-- types are not operational at all: a telemedicine call record and a clinical
-- handover are consultation notes by another name, so wellness readers see
-- every other type and not those.
ALTER TABLE public.med_log_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_log_entries_select" ON public.med_log_entries;
CREATE POLICY "med_log_entries_select" ON public.med_log_entries
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.medical_can_view(auth.uid())
      OR (
        public.wellness_can_view(auth.uid())
        AND log_type NOT IN ('telemedicine', 'handover')
      )
    )
  );
DROP POLICY IF EXISTS "med_log_entries_write" ON public.med_log_entries;
CREATE POLICY "med_log_entries_write" ON public.med_log_entries
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  );

-- Stock movements name a patient, so they are clinical.
ALTER TABLE public.med_supply_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_supply_transactions_select" ON public.med_supply_transactions;
CREATE POLICY "med_supply_transactions_select" ON public.med_supply_transactions
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_view(auth.uid())
  );
DROP POLICY IF EXISTS "med_supply_transactions_write" ON public.med_supply_transactions;
CREATE POLICY "med_supply_transactions_write" ON public.med_supply_transactions
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  );

ALTER TABLE public.med_kit_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_kit_checks_select" ON public.med_kit_checks;
CREATE POLICY "med_kit_checks_select" ON public.med_kit_checks
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.medical_can_view(auth.uid()) OR public.wellness_can_view(auth.uid()))
  );
DROP POLICY IF EXISTS "med_kit_checks_write" ON public.med_kit_checks;
CREATE POLICY "med_kit_checks_write" ON public.med_kit_checks
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  );

-- Protocols are reference material: everyone in the company can read an
-- active one; only medical staff can write.
ALTER TABLE public.med_protocols ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_protocols_select" ON public.med_protocols;
CREATE POLICY "med_protocols_select" ON public.med_protocols
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (status = 'active' OR public.medical_can_view(auth.uid()))
  );
DROP POLICY IF EXISTS "med_protocols_write" ON public.med_protocols;
CREATE POLICY "med_protocols_write" ON public.med_protocols
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.medical_can_edit(auth.uid())
  );

ALTER TABLE public.med_protocol_acknowledgements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_protocol_acks_select" ON public.med_protocol_acknowledgements;
CREATE POLICY "med_protocol_acks_select" ON public.med_protocol_acknowledgements
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.medical_can_view(auth.uid()) OR profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "med_protocol_acks_insert" ON public.med_protocol_acknowledgements;
CREATE POLICY "med_protocol_acks_insert" ON public.med_protocol_acknowledgements
  FOR INSERT WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (profile_id = public.my_profile_id() OR public.medical_can_edit(auth.uid()))
  );

-- Screening: the subject reads and answers their own; medical staff read all.
ALTER TABLE public.med_screening_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_screening_templates_select" ON public.med_screening_templates;
CREATE POLICY "med_screening_templates_select" ON public.med_screening_templates
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "med_screening_templates_write" ON public.med_screening_templates;
CREATE POLICY "med_screening_templates_write" ON public.med_screening_templates
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id) AND public.medical_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id) AND public.medical_can_edit(auth.uid())
  );

ALTER TABLE public.med_screening_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_screening_questions_select" ON public.med_screening_questions;
CREATE POLICY "med_screening_questions_select" ON public.med_screening_questions
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "med_screening_questions_write" ON public.med_screening_questions;
CREATE POLICY "med_screening_questions_write" ON public.med_screening_questions
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id) AND public.medical_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id) AND public.medical_can_edit(auth.uid())
  );

ALTER TABLE public.med_screening_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_screening_records_select" ON public.med_screening_records;
CREATE POLICY "med_screening_records_select" ON public.med_screening_records
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.medical_can_view(auth.uid()) OR public.hw_person_is_self(auth.uid(), person_id))
  );
DROP POLICY IF EXISTS "med_screening_records_write" ON public.med_screening_records;
CREATE POLICY "med_screening_records_write" ON public.med_screening_records
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.medical_can_edit(auth.uid()) OR public.hw_person_is_self(auth.uid(), person_id))
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.medical_can_edit(auth.uid()) OR public.hw_person_is_self(auth.uid(), person_id))
  );

ALTER TABLE public.med_screening_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_screening_answers_select" ON public.med_screening_answers;
CREATE POLICY "med_screening_answers_select" ON public.med_screening_answers
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM public.med_screening_records r
      WHERE r.id = med_screening_answers.record_id
        AND (public.medical_can_view(auth.uid()) OR public.hw_person_is_self(auth.uid(), r.person_id))
    )
  );
DROP POLICY IF EXISTS "med_screening_answers_write" ON public.med_screening_answers;
CREATE POLICY "med_screening_answers_write" ON public.med_screening_answers
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM public.med_screening_records r
      WHERE r.id = med_screening_answers.record_id
        AND (public.medical_can_edit(auth.uid()) OR public.hw_person_is_self(auth.uid(), r.person_id))
    )
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM public.med_screening_records r
      WHERE r.id = med_screening_answers.record_id
        AND (public.medical_can_edit(auth.uid()) OR public.hw_person_is_self(auth.uid(), r.person_id))
    )
  );

ALTER TABLE public.hw_practitioner_qualifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hw_pract_quals_select" ON public.hw_practitioner_qualifications;
CREATE POLICY "hw_pract_quals_select" ON public.hw_practitioner_qualifications
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.wellness_can_view(auth.uid())
      OR public.medical_can_view(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.hw_practitioners pr
        WHERE pr.id = hw_practitioner_qualifications.practitioner_id
          AND pr.profile_id = public.my_profile_id()
      )
    )
  );
-- Same rule as the roster itself: HR edit rights do not reach it.
DROP POLICY IF EXISTS "hw_pract_quals_write" ON public.hw_practitioner_qualifications;
CREATE POLICY "hw_pract_quals_write" ON public.hw_practitioner_qualifications
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.wellness_can_admin(auth.uid()) OR public.medical_can_admin(auth.uid()))
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.wellness_can_admin(auth.uid()) OR public.medical_can_admin(auth.uid()))
  );

-- ---------------------------------------------------------------
-- 13. updated_at triggers
-- ---------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hw_practitioner_qualifications','med_patient_records','med_allergies','med_conditions',
    'med_medications','med_vaccinations','med_fitness_assessments','med_consultations',
    'med_supply_locations','med_supply_items','med_equipment','med_first_aid_kits',
    'med_protocols','med_screening_templates','med_screening_questions','med_screening_records'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 14. Grants
-- ---------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hw_practitioner_qualifications','med_patient_records','med_allergies','med_conditions',
    'med_medications','med_vaccinations','med_fitness_assessments','med_consultations',
    'med_supply_locations','med_supply_items','med_supply_transactions','med_equipment',
    'med_first_aid_kits','med_kit_checks','med_protocols','med_protocol_acknowledgements',
    'med_log_entries','med_screening_templates','med_screening_questions',
    'med_screening_records','med_screening_answers'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.med_consultation_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.med_supply_apply_transaction() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.med_kit_check_after_insert() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.med_fitness_after_write() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.med_register_clinical_record() FROM PUBLIC, anon;