-- =================================================================
-- HEALTH & WELLNESS PHASE 3: SPA, NUTRITION, PHYSIO
-- =================================================================
-- 1. spa_treatments / spa_rooms / spa_bookings / spa_inventory_*
-- 2. nut_profiles / nut_foods / nut_food_log_entries / nut_meal_plans / nut_goals
-- 3. physio_assessments / physio_assessment_items / physio_treatment_plans /
--    physio_sessions
--
-- These are wellness records, not clinical ones: gated on wellness_can_*
-- with the subject always able to read their own. Physiotherapy notes are
-- the exception — they are treated as clinical and additionally visible to
-- medical staff, because a physio finding can ground a crew member.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. SPA
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spa_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'massage'
    CHECK (category IN ('massage','facial','body','nail','hair','hydrotherapy','sauna','wellness','fitness','other')),
  description text,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  currency char(3),
  requires_room boolean NOT NULL DEFAULT true,
  equipment_required text,
  products_used text,
  contraindications text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spa_treatments_company ON public.spa_treatments(company_id, is_active);

CREATE TABLE IF NOT EXISTS public.spa_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  name text NOT NULL,
  room_type text NOT NULL DEFAULT 'treatment'
    CHECK (room_type IN ('treatment','sauna','steam','hammam','salon','gym','pool','other')),
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  equipment text,
  deck text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spa_rooms_company ON public.spa_rooms(company_id, vessel_id, is_active);

CREATE TABLE IF NOT EXISTS public.spa_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.spa_treatments(id) ON DELETE SET NULL,
  therapist_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.spa_rooms(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('requested','confirmed','in_progress','completed','cancelled','no_show')),
  booking_source text NOT NULL DEFAULT 'staff' CHECK (booking_source IN ('staff','self','guest_services')),
  client_notes text,
  therapist_notes text,
  contraindications_checked boolean NOT NULL DEFAULT false,
  cancelled_reason text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spa_bookings_time_order CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_spa_bookings_company ON public.spa_bookings(company_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_spa_bookings_person ON public.spa_bookings(person_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_spa_bookings_therapist ON public.spa_bookings(therapist_id, starts_at);

CREATE TABLE IF NOT EXISTS public.spa_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'product'
    CHECK (category IN ('product','linen','consumable','equipment','retail','other')),
  brand text,
  unit text NOT NULL DEFAULT 'unit',
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  minimum_quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  expiry_date date,
  supplier text,
  unit_cost_minor bigint,
  currency char(3),
  storage_location text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spa_inventory_company ON public.spa_inventory_items(company_id, vessel_id, is_active);

CREATE TABLE IF NOT EXISTS public.spa_inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.spa_inventory_items(id) ON DELETE CASCADE,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('receipt','use','disposal','adjustment','stock_check')),
  quantity_delta numeric(12,2) NOT NULL,
  quantity_after numeric(12,2),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid REFERENCES public.spa_bookings(id) ON DELETE SET NULL,
  reason text,
  performed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spa_inventory_tx_item ON public.spa_inventory_transactions(item_id, occurred_at DESC);

-- ---------------------------------------------------------------
-- 2. NUTRITION
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nut_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL UNIQUE REFERENCES public.hw_people(id) ON DELETE CASCADE,
  goal_type text NOT NULL DEFAULT 'maintain'
    CHECK (goal_type IN ('maintain','lose_fat','gain_muscle','performance','medical','recovery')),
  activity_level text NOT NULL DEFAULT 'moderate'
    CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  target_calories integer CHECK (target_calories IS NULL OR target_calories > 0),
  target_protein_g integer,
  target_carbs_g integer,
  target_fat_g integer,
  target_fibre_g integer,
  target_water_ml integer,
  dietary_preferences text[] NOT NULL DEFAULT '{}',
  dislikes text,
  supplements text,
  nutritionist_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nut_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  category text CHECK (category IS NULL OR category IN ('protein','carbohydrate','fat','vegetable','fruit','dairy','drink','snack','supplement','composite','other')),
  serving_description text NOT NULL DEFAULT '100 g',
  serving_grams numeric(8,2) NOT NULL DEFAULT 100 CHECK (serving_grams > 0),
  calories numeric(8,2) NOT NULL DEFAULT 0 CHECK (calories >= 0),
  protein_g numeric(8,2) NOT NULL DEFAULT 0,
  carbs_g numeric(8,2) NOT NULL DEFAULT 0,
  fat_g numeric(8,2) NOT NULL DEFAULT 0,
  fibre_g numeric(8,2),
  sugar_g numeric(8,2),
  sodium_mg numeric(8,2),
  allergens text[] NOT NULL DEFAULT '{}',
  is_recipe boolean NOT NULL DEFAULT false,
  recipe_method text,
  source text NOT NULL DEFAULT 'custom' CHECK (source IN ('custom','imported','galley')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nut_foods_company ON public.nut_foods(company_id, is_active);

CREATE TABLE IF NOT EXISTS public.nut_food_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  logged_on date NOT NULL DEFAULT CURRENT_DATE,
  meal text NOT NULL DEFAULT 'lunch'
    CHECK (meal IN ('breakfast','lunch','dinner','snack','drink','pre_workout','post_workout')),
  food_id uuid REFERENCES public.nut_foods(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(8,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'serving',
  calories numeric(8,2) NOT NULL DEFAULT 0 CHECK (calories >= 0),
  protein_g numeric(8,2) NOT NULL DEFAULT 0,
  carbs_g numeric(8,2) NOT NULL DEFAULT 0,
  fat_g numeric(8,2) NOT NULL DEFAULT 0,
  water_ml integer,
  notes text,
  logged_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nut_log_person_day ON public.nut_food_log_entries(person_id, logged_on DESC);

CREATE TABLE IF NOT EXISTS public.nut_meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  -- Null person_id means a vessel-wide menu rather than a personal plan.
  person_id uuid REFERENCES public.hw_people(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  meal text NOT NULL DEFAULT 'lunch'
    CHECK (meal IN ('breakfast','lunch','dinner','snack','drink','crew_mess','guest_service')),
  title text NOT NULL,
  description text,
  recipe_id uuid REFERENCES public.nut_foods(id) ON DELETE SET NULL,
  serves integer CHECK (serves IS NULL OR serves > 0),
  allergens text[] NOT NULL DEFAULT '{}',
  calories numeric(8,2),
  prepared_by text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','prepared','served','cancelled')),
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nut_meal_plans_date ON public.nut_meal_plans(company_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_nut_meal_plans_person ON public.nut_meal_plans(person_id, plan_date);

CREATE TABLE IF NOT EXISTS public.nut_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  title text NOT NULL,
  metric text NOT NULL DEFAULT 'weight'
    CHECK (metric IN ('weight','body_fat','calories','protein','carbs','fat','water','waist','custom')),
  target_value numeric(10,2),
  start_value numeric(10,2),
  current_value numeric(10,2),
  unit text,
  direction text NOT NULL DEFAULT 'decrease' CHECK (direction IN ('increase','decrease','maintain')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','missed','abandoned','paused')),
  achieved_on date,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nut_goals_person ON public.nut_goals(person_id, status);

-- ---------------------------------------------------------------
-- 3. PHYSIO
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.physio_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  assessed_on date NOT NULL DEFAULT CURRENT_DATE,
  practitioner_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  assessment_type text NOT NULL DEFAULT 'initial'
    CHECK (assessment_type IN ('initial','follow_up','discharge','screening','fms','return_to_work')),
  chief_complaint text,
  history text,
  observations text,
  pain_score integer CHECK (pain_score IS NULL OR (pain_score >= 0 AND pain_score <= 10)),
  pain_location text,
  aggravating_factors text,
  easing_factors text,
  diagnosis text,
  red_flags text,
  fit_for_duty text CHECK (fit_for_duty IS NULL OR fit_for_duty IN ('fit','light_duties','unfit')),
  plan text,
  referral_id uuid REFERENCES public.hw_referrals(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_physio_assessments_person ON public.physio_assessments(person_id, assessed_on DESC);

CREATE TABLE IF NOT EXISTS public.physio_assessment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES public.physio_assessments(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'range_of_motion'
    CHECK (category IN ('range_of_motion','strength','special_test','posture','movement_screen','functional','other')),
  label text NOT NULL,
  side text NOT NULL DEFAULT 'n/a' CHECK (side IN ('left','right','bilateral','n/a')),
  value_numeric numeric(10,2),
  value_text text,
  unit text,
  normal_range text,
  is_flagged boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_physio_items_assessment ON public.physio_assessment_items(assessment_id, position);

CREATE TABLE IF NOT EXISTS public.physio_treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES public.physio_assessments(id) ON DELETE SET NULL,
  practitioner_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  title text NOT NULL,
  diagnosis text,
  goals text,
  frequency text,
  -- A rehab programme template from the shared library (pt_program_templates
  -- with category 'rehab'); the FK is added in phase 4.
  protocol_template_id uuid,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  review_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','on_hold','completed','discharged','cancelled')),
  discharge_summary text,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_physio_plans_person ON public.physio_treatment_plans(person_id, status);

CREATE TABLE IF NOT EXISTS public.physio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.physio_treatment_plans(id) ON DELETE SET NULL,
  practitioner_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  starts_at timestamptz,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  subjective text,
  objective text,
  treatment_given text,
  pain_before integer CHECK (pain_before IS NULL OR (pain_before >= 0 AND pain_before <= 10)),
  pain_after integer CHECK (pain_after IS NULL OR (pain_after >= 0 AND pain_after <= 10)),
  home_exercise text,
  next_session_on date,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_physio_sessions_person ON public.physio_sessions(person_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_physio_sessions_plan ON public.physio_sessions(plan_id, session_date DESC);

-- ---------------------------------------------------------------
-- 4. Engines
-- ---------------------------------------------------------------

-- A therapist or a room cannot be double booked.
CREATE OR REPLACE FUNCTION public.spa_booking_check_clash()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clash text;
BEGIN
  IF NEW.status IN ('cancelled','no_show') THEN
    RETURN NEW;
  END IF;

  IF NEW.therapist_id IS NOT NULL THEN
    SELECT 'therapist' INTO v_clash
    FROM public.spa_bookings b
    WHERE b.id <> NEW.id
      AND b.therapist_id = NEW.therapist_id
      AND b.status NOT IN ('cancelled','no_show')
      AND b.starts_at < NEW.ends_at
      AND b.ends_at > NEW.starts_at
    LIMIT 1;
    IF v_clash IS NOT NULL THEN
      RAISE EXCEPTION 'That therapist already has a booking overlapping this time';
    END IF;
  END IF;

  IF NEW.room_id IS NOT NULL THEN
    SELECT 'room' INTO v_clash
    FROM public.spa_bookings b
    WHERE b.id <> NEW.id
      AND b.room_id = NEW.room_id
      AND b.status NOT IN ('cancelled','no_show')
      AND b.starts_at < NEW.ends_at
      AND b.ends_at > NEW.starts_at
    LIMIT 1;
    IF v_clash IS NOT NULL THEN
      RAISE EXCEPTION 'That room is already booked for an overlapping time';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_spa_bookings_clash ON public.spa_bookings;
CREATE TRIGGER trg_spa_bookings_clash BEFORE INSERT OR UPDATE ON public.spa_bookings
  FOR EACH ROW EXECUTE FUNCTION public.spa_booking_check_clash();

CREATE OR REPLACE FUNCTION public.spa_inventory_apply_transaction()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.spa_inventory_items;
  v_new numeric(12,2);
BEGIN
  SELECT * INTO v_item FROM public.spa_inventory_items WHERE id = NEW.item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'spa inventory item % not found', NEW.item_id;
  END IF;

  IF NEW.transaction_type = 'stock_check' THEN
    v_new := NEW.quantity_delta;
    NEW.quantity_delta := v_new - v_item.quantity;
  ELSE
    v_new := v_item.quantity + NEW.quantity_delta;
  END IF;

  IF v_new < 0 THEN
    RAISE EXCEPTION 'Spa inventory cannot go negative (% would become %)', v_item.name, v_new;
  END IF;

  NEW.quantity_after := v_new;
  UPDATE public.spa_inventory_items SET quantity = v_new, updated_at = now() WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_spa_inventory_tx ON public.spa_inventory_transactions;
CREATE TRIGGER trg_spa_inventory_tx BEFORE INSERT ON public.spa_inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.spa_inventory_apply_transaction();

-- A food log line copies its macros from the food library when one is
-- chosen, so the totals cannot drift from the library.
CREATE OR REPLACE FUNCTION public.nut_food_log_fill_macros()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.nut_foods;
BEGIN
  IF NEW.food_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO f FROM public.nut_foods WHERE id = NEW.food_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.description, '') = '' THEN
    NEW.description := f.name;
  END IF;
  NEW.calories  := ROUND(f.calories  * NEW.quantity, 2);
  NEW.protein_g := ROUND(f.protein_g * NEW.quantity, 2);
  NEW.carbs_g   := ROUND(f.carbs_g   * NEW.quantity, 2);
  NEW.fat_g     := ROUND(f.fat_g     * NEW.quantity, 2);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_nut_food_log_macros ON public.nut_food_log_entries;
CREATE TRIGGER trg_nut_food_log_macros BEFORE INSERT OR UPDATE ON public.nut_food_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.nut_food_log_fill_macros();

-- ---------------------------------------------------------------
-- 5. Row level security
-- ---------------------------------------------------------------

-- Company-wide reference data: readable by anyone with wellness view,
-- writable by wellness editors.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'spa_treatments','spa_rooms','spa_inventory_items','spa_inventory_transactions','nut_foods'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT USING (
        public.user_belongs_to_company(auth.uid(), company_id)
      )$f$, t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND public.wellness_can_edit(auth.uid())
      ) WITH CHECK (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND public.wellness_can_edit(auth.uid())
      )$f$, t || '_write', t);
  END LOOP;
END $$;

-- Per-person wellness records: staff, or the subject themselves.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'spa_bookings','nut_profiles','nut_food_log_entries','nut_goals'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.wellness_can_view(auth.uid())
          OR public.hw_person_is_self(auth.uid(), person_id)
        )
      )$f$, t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.wellness_can_edit(auth.uid())
          OR public.hw_person_is_self(auth.uid(), person_id)
        )
      ) WITH CHECK (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.wellness_can_edit(auth.uid())
          OR public.hw_person_is_self(auth.uid(), person_id)
        )
      )$f$, t || '_write', t);
  END LOOP;
END $$;

-- Meal plans: a vessel menu (person_id null) is readable company-wide.
ALTER TABLE public.nut_meal_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nut_meal_plans_select" ON public.nut_meal_plans;
CREATE POLICY "nut_meal_plans_select" ON public.nut_meal_plans
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      person_id IS NULL
      OR public.wellness_can_view(auth.uid())
      OR public.hw_person_is_self(auth.uid(), person_id)
    )
  );
DROP POLICY IF EXISTS "nut_meal_plans_write" ON public.nut_meal_plans;
CREATE POLICY "nut_meal_plans_write" ON public.nut_meal_plans
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.wellness_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.wellness_can_edit(auth.uid())
  );

-- Physiotherapy is clinical: physios and medical staff, plus the subject.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['physio_assessments','physio_treatment_plans','physio_sessions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.medical_can_view(auth.uid())
          OR public.hw_is_practitioner(auth.uid(), 'physio')
          OR public.wellness_can_admin(auth.uid())
          OR public.hw_person_is_self(auth.uid(), person_id)
        )
      )$f$, t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.medical_can_edit(auth.uid())
          OR public.hw_is_practitioner(auth.uid(), 'physio')
          OR public.wellness_can_admin(auth.uid())
        )
      ) WITH CHECK (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.medical_can_edit(auth.uid())
          OR public.hw_is_practitioner(auth.uid(), 'physio')
          OR public.wellness_can_admin(auth.uid())
        )
      )$f$, t || '_write', t);
  END LOOP;
END $$;

ALTER TABLE public.physio_assessment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "physio_assessment_items_select" ON public.physio_assessment_items;
CREATE POLICY "physio_assessment_items_select" ON public.physio_assessment_items
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM public.physio_assessments a
      WHERE a.id = physio_assessment_items.assessment_id
        AND (
          public.medical_can_view(auth.uid())
          OR public.hw_is_practitioner(auth.uid(), 'physio')
          OR public.wellness_can_admin(auth.uid())
          OR public.hw_person_is_self(auth.uid(), a.person_id)
        )
    )
  );
DROP POLICY IF EXISTS "physio_assessment_items_write" ON public.physio_assessment_items;
CREATE POLICY "physio_assessment_items_write" ON public.physio_assessment_items
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.medical_can_edit(auth.uid())
      OR public.hw_is_practitioner(auth.uid(), 'physio')
      OR public.wellness_can_admin(auth.uid())
    )
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.medical_can_edit(auth.uid())
      OR public.hw_is_practitioner(auth.uid(), 'physio')
      OR public.wellness_can_admin(auth.uid())
    )
  );

-- ---------------------------------------------------------------
-- 6. updated_at triggers and grants
-- ---------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'spa_treatments','spa_rooms','spa_bookings','spa_inventory_items',
    'nut_profiles','nut_foods','nut_food_log_entries','nut_meal_plans','nut_goals',
    'physio_assessments','physio_treatment_plans','physio_sessions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'trg_' || t || '_updated_at', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'spa_treatments','spa_rooms','spa_bookings','spa_inventory_items','spa_inventory_transactions',
    'nut_profiles','nut_foods','nut_food_log_entries','nut_meal_plans','nut_goals',
    'physio_assessments','physio_assessment_items','physio_treatment_plans','physio_sessions'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.spa_booking_check_clash() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.spa_inventory_apply_transaction() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nut_food_log_fill_macros() FROM PUBLIC, anon;
