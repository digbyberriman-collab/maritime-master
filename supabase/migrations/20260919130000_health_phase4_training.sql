-- =================================================================
-- HEALTH & WELLNESS PHASE 4: PERSONAL TRAINING
-- =================================================================
-- 1. pt_exercise_sources   — import connectors (wger, ExerciseDB, …)
-- 2. pt_exercises          — exercise library
-- 3. pt_videos             — media library
-- 4. pt_program_templates / pt_template_days / pt_template_items
--    Templates with category 'rehab' are the shared rehab protocol
--    library used by both Physio and PT Programming.
-- 5. pt_programs / pt_program_sessions / pt_session_items / pt_set_logs
--    An assigned programme snapshots the template, so editing a template
--    never rewrites an athlete's history.
-- 6. pt_appointments       — the trainer's diary
-- =================================================================

-- ---------------------------------------------------------------
-- 1. Exercise sources
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pt_exercise_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_key text NOT NULL
    CHECK (source_key IN ('wger','exercisedb','exercisedb_import','musclewiki','anatomytool','z_anatomy','custom')),
  label text NOT NULL,
  base_url text,
  -- Credential for sources that need one. This table is admin-only: it is
  -- the reason credentials are not kept on hw_settings, which every
  -- trainer can read.
  credential text,
  licence text,
  attribution text,
  is_enabled boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_sync_status text CHECK (last_sync_status IS NULL OR last_sync_status IN ('success','partial','failed')),
  last_sync_message text,
  imported_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_key)
);

COMMENT ON TABLE public.pt_exercise_sources IS 'Exercise import connectors. Admin-only because `credential` holds API keys; wger needs none, ExerciseDB does.';

-- ---------------------------------------------------------------
-- 2. Exercise library
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pt_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'strength'
    CHECK (category IN ('strength','cardio','mobility','rehab','plyometric','balance','stretch','core','skill','other')),
  body_part text,
  target_muscle text,
  secondary_muscles text[] NOT NULL DEFAULT '{}',
  equipment text,
  difficulty text CHECK (difficulty IS NULL OR difficulty IN ('beginner','intermediate','advanced')),
  instructions text,
  coaching_cues text,
  contraindications text,
  is_rehab boolean NOT NULL DEFAULT false,
  video_url text,
  image_url text,
  source text NOT NULL DEFAULT 'custom'
    CHECK (source IN ('custom','wger','exercisedb','exercisedb_import','musclewiki','anatomytool','z_anatomy')),
  source_id text,
  source_licence text,
  attribution text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_exercises_company ON public.pt_exercises(company_id, is_active, category);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pt_exercises_source
  ON public.pt_exercises(company_id, source, source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pt_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'technique'
    CHECK (category IN ('technique','warm_up','cool_down','rehab','mobility','class','education','other')),
  url text,
  storage_path text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  exercise_id uuid REFERENCES public.pt_exercises(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_videos_has_media CHECK (url IS NOT NULL OR storage_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pt_videos_company ON public.pt_videos(company_id, is_active);

-- ---------------------------------------------------------------
-- 3. Programme templates (rehab protocols live here too)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pt_program_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','strength','hypertrophy','endurance','power','mobility','rehab','sport','onboard_minimal')),
  description text,
  goals text,
  duration_weeks integer NOT NULL DEFAULT 4 CHECK (duration_weeks > 0),
  sessions_per_week integer NOT NULL DEFAULT 3 CHECK (sessions_per_week > 0),
  difficulty text CHECK (difficulty IS NULL OR difficulty IN ('beginner','intermediate','advanced')),
  equipment_needed text,
  -- Rehab protocols are authored by physios and appear in both Physio ›
  -- Rehab Protocols and PT › Programming › Rehab Protocols.
  is_rehab boolean NOT NULL DEFAULT false,
  body_region text,
  stage text,
  clinical_notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_templates_company ON public.pt_program_templates(company_id, is_active, category);

ALTER TABLE public.physio_treatment_plans
  DROP CONSTRAINT IF EXISTS physio_treatment_plans_protocol_template_id_fkey;
ALTER TABLE public.physio_treatment_plans
  ADD CONSTRAINT physio_treatment_plans_protocol_template_id_fkey
  FOREIGN KEY (protocol_template_id) REFERENCES public.pt_program_templates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.pt_template_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.pt_program_templates(id) ON DELETE CASCADE,
  week_number integer NOT NULL DEFAULT 1 CHECK (week_number > 0),
  day_number integer NOT NULL DEFAULT 1 CHECK (day_number > 0),
  title text NOT NULL DEFAULT 'Session',
  focus text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, week_number, day_number)
);
CREATE INDEX IF NOT EXISTS idx_pt_template_days_template ON public.pt_template_days(template_id, week_number, day_number);

CREATE TABLE IF NOT EXISTS public.pt_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day_id uuid NOT NULL REFERENCES public.pt_template_days(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES public.pt_exercises(id) ON DELETE SET NULL,
  exercise_name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  block text,
  sets integer CHECK (sets IS NULL OR sets > 0),
  reps text,
  tempo text,
  rest_seconds integer CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
  load_prescription text,
  rpe numeric(3,1) CHECK (rpe IS NULL OR (rpe >= 0 AND rpe <= 10)),
  duration_seconds integer,
  distance_m integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_template_items_day ON public.pt_template_items(day_id, position);

-- ---------------------------------------------------------------
-- 4. Assigned programmes
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pt_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.pt_program_templates(id) ON DELETE SET NULL,
  trainer_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  physio_plan_id uuid REFERENCES public.physio_treatment_plans(id) ON DELETE SET NULL,
  name text NOT NULL,
  goals text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','paused','completed','cancelled')),
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_programs_person ON public.pt_programs(person_id, status);
CREATE INDEX IF NOT EXISTS idx_pt_programs_company ON public.pt_programs(company_id, status);

CREATE TABLE IF NOT EXISTS public.pt_program_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.pt_programs(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  week_number integer NOT NULL DEFAULT 1 CHECK (week_number > 0),
  day_number integer NOT NULL DEFAULT 1 CHECK (day_number > 0),
  title text NOT NULL DEFAULT 'Session',
  focus text,
  scheduled_on date,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','skipped','missed','in_progress')),
  completed_at timestamptz,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  session_rpe numeric(3,1) CHECK (session_rpe IS NULL OR (session_rpe >= 0 AND session_rpe <= 10)),
  athlete_notes text,
  trainer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_program ON public.pt_program_sessions(program_id, week_number, day_number);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_person ON public.pt_program_sessions(person_id, scheduled_on);

CREATE TABLE IF NOT EXISTS public.pt_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.pt_program_sessions(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES public.pt_exercises(id) ON DELETE SET NULL,
  exercise_name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  block text,
  prescribed_sets integer,
  prescribed_reps text,
  prescribed_load text,
  tempo text,
  rest_seconds integer,
  rpe numeric(3,1) CHECK (rpe IS NULL OR (rpe >= 0 AND rpe <= 10)),
  duration_seconds integer,
  distance_m integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_session_items_session ON public.pt_session_items(session_id, position);

CREATE TABLE IF NOT EXISTS public.pt_set_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_item_id uuid NOT NULL REFERENCES public.pt_session_items(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  set_number integer NOT NULL DEFAULT 1 CHECK (set_number > 0),
  reps integer CHECK (reps IS NULL OR reps >= 0),
  weight_kg numeric(7,2) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  duration_seconds integer,
  distance_m integer,
  rpe numeric(3,1) CHECK (rpe IS NULL OR (rpe >= 0 AND rpe <= 10)),
  completed boolean NOT NULL DEFAULT true,
  notes text,
  logged_at timestamptz NOT NULL DEFAULT now(),
  logged_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  UNIQUE (session_item_id, set_number)
);
CREATE INDEX IF NOT EXISTS idx_pt_set_logs_item ON public.pt_set_logs(session_item_id, set_number);
CREATE INDEX IF NOT EXISTS idx_pt_set_logs_person ON public.pt_set_logs(person_id, logged_at DESC);

-- ---------------------------------------------------------------
-- 5. Trainer diary
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pt_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  trainer_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.hw_people(id) ON DELETE CASCADE,
  program_session_id uuid REFERENCES public.pt_program_sessions(id) ON DELETE SET NULL,
  title text,
  session_type text NOT NULL DEFAULT 'one_to_one'
    CHECK (session_type IN ('one_to_one','group','class','assessment','rehab','consultation')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('requested','confirmed','completed','cancelled','no_show')),
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_appointments_time_order CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_pt_appointments_company ON public.pt_appointments(company_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_pt_appointments_trainer ON public.pt_appointments(trainer_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_pt_appointments_person ON public.pt_appointments(person_id, starts_at DESC);

-- ---------------------------------------------------------------
-- 6. Assignment engine: snapshot a template into a programme
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pt_assign_template(
  p_person_id uuid,
  p_template_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_trainer_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_physio_plan_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id uuid;
  v_template public.pt_program_templates;
  v_program_id uuid;
  v_day record;
  v_session_id uuid;
  v_end_date date;
BEGIN
  SELECT company_id INTO v_company_id FROM public.hw_people WHERE id = p_person_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'person % not found', p_person_id;
  END IF;
  IF NOT public.user_belongs_to_company(auth.uid(), v_company_id) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  IF NOT (public.wellness_can_edit(auth.uid()) OR public.medical_can_edit(auth.uid())) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  SELECT * INTO v_template FROM public.pt_program_templates
  WHERE id = p_template_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template % not found', p_template_id;
  END IF;

  v_end_date := (p_start_date + make_interval(weeks => v_template.duration_weeks))::date;

  INSERT INTO public.pt_programs (
    company_id, person_id, template_id, trainer_id, physio_plan_id,
    name, goals, start_date, end_date, status, created_by
  ) VALUES (
    v_company_id, p_person_id, p_template_id, p_trainer_id, p_physio_plan_id,
    COALESCE(p_name, v_template.name), v_template.goals, p_start_date, v_end_date, 'active', auth.uid()
  ) RETURNING id INTO v_program_id;

  FOR v_day IN
    SELECT * FROM public.pt_template_days
    WHERE template_id = p_template_id
    ORDER BY week_number, day_number
  LOOP
    INSERT INTO public.pt_program_sessions (
      company_id, program_id, person_id, week_number, day_number, title, focus,
      scheduled_on, status
    ) VALUES (
      v_company_id, v_program_id, p_person_id, v_day.week_number, v_day.day_number,
      v_day.title, v_day.focus,
      (p_start_date + make_interval(weeks => v_day.week_number - 1, days => v_day.day_number - 1))::date,
      'scheduled'
    ) RETURNING id INTO v_session_id;

    INSERT INTO public.pt_session_items (
      company_id, session_id, exercise_id, exercise_name, position, block,
      prescribed_sets, prescribed_reps, prescribed_load, tempo, rest_seconds,
      rpe, duration_seconds, distance_m, notes
    )
    SELECT
      v_company_id, v_session_id, ti.exercise_id, ti.exercise_name, ti.position, ti.block,
      ti.sets, ti.reps, ti.load_prescription, ti.tempo, ti.rest_seconds,
      ti.rpe, ti.duration_seconds, ti.distance_m, ti.notes
    FROM public.pt_template_items ti
    WHERE ti.day_id = v_day.id
    ORDER BY ti.position;
  END LOOP;

  RETURN v_program_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pt_assign_template(uuid, uuid, date, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pt_assign_template(uuid, uuid, date, uuid, text, uuid) TO authenticated, service_role;

-- Logging a set marks its session in progress; completing every item
-- completes the session.
CREATE OR REPLACE FUNCTION public.pt_set_log_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_id uuid;
BEGIN
  SELECT session_id INTO v_session_id FROM public.pt_session_items WHERE id = NEW.session_item_id;
  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.pt_program_sessions
  SET status = CASE WHEN status IN ('scheduled','missed','skipped') THEN 'in_progress' ELSE status END,
      updated_at = now()
  WHERE id = v_session_id;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pt_set_logs_after ON public.pt_set_logs;
CREATE TRIGGER trg_pt_set_logs_after AFTER INSERT ON public.pt_set_logs
  FOR EACH ROW EXECUTE FUNCTION public.pt_set_log_after_write();

-- ---------------------------------------------------------------
-- 7. Row level security
-- ---------------------------------------------------------------

-- Library data: readable company-wide, writable by wellness editors.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pt_exercises','pt_videos','pt_program_templates','pt_template_days','pt_template_items'
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

-- Sources hold credentials: admins only.
ALTER TABLE public.pt_exercise_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pt_exercise_sources_select" ON public.pt_exercise_sources;
CREATE POLICY "pt_exercise_sources_select" ON public.pt_exercise_sources
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.wellness_can_admin(auth.uid())
  );
DROP POLICY IF EXISTS "pt_exercise_sources_write" ON public.pt_exercise_sources;
CREATE POLICY "pt_exercise_sources_write" ON public.pt_exercise_sources
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.wellness_can_admin(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.wellness_can_admin(auth.uid())
  );

-- Athlete-owned records: wellness staff, or the athlete themselves.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pt_programs','pt_program_sessions','pt_set_logs','pt_appointments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.wellness_can_view(auth.uid())
          OR (person_id IS NOT NULL AND public.hw_person_is_self(auth.uid(), person_id))
        )
      )$f$, t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL USING (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.wellness_can_edit(auth.uid())
          OR (person_id IS NOT NULL AND public.hw_person_is_self(auth.uid(), person_id))
        )
      ) WITH CHECK (
        public.user_belongs_to_company(auth.uid(), company_id)
        AND (
          public.wellness_can_edit(auth.uid())
          OR (person_id IS NOT NULL AND public.hw_person_is_self(auth.uid(), person_id))
        )
      )$f$, t || '_write', t);
  END LOOP;
END $$;

-- Session items follow their session.
ALTER TABLE public.pt_session_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pt_session_items_select" ON public.pt_session_items;
CREATE POLICY "pt_session_items_select" ON public.pt_session_items
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM public.pt_program_sessions s
      WHERE s.id = pt_session_items.session_id
        AND (public.wellness_can_view(auth.uid()) OR public.hw_person_is_self(auth.uid(), s.person_id))
    )
  );
DROP POLICY IF EXISTS "pt_session_items_write" ON public.pt_session_items;
CREATE POLICY "pt_session_items_write" ON public.pt_session_items
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM public.pt_program_sessions s
      WHERE s.id = pt_session_items.session_id
        AND (public.wellness_can_edit(auth.uid()) OR public.hw_person_is_self(auth.uid(), s.person_id))
    )
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM public.pt_program_sessions s
      WHERE s.id = pt_session_items.session_id
        AND (public.wellness_can_edit(auth.uid()) OR public.hw_person_is_self(auth.uid(), s.person_id))
    )
  );

-- ---------------------------------------------------------------
-- 8. updated_at triggers and grants
-- ---------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pt_exercise_sources','pt_exercises','pt_videos','pt_program_templates',
    'pt_template_days','pt_template_items','pt_programs','pt_program_sessions',
    'pt_session_items','pt_appointments'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'trg_' || t || '_updated_at', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'pt_exercise_sources','pt_exercises','pt_videos','pt_program_templates',
    'pt_template_days','pt_template_items','pt_programs','pt_program_sessions',
    'pt_session_items','pt_set_logs','pt_appointments'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.pt_set_log_after_write() FROM PUBLIC, anon;
