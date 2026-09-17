-- =================================================================
-- HRIS PHASE 3: PERFORMANCE
-- =================================================================
CREATE TABLE IF NOT EXISTS public.performance_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  department text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_competencies TO authenticated;
GRANT ALL ON public.performance_competencies TO service_role;
ALTER TABLE public.performance_competencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "performance_competencies_select" ON public.performance_competencies;
CREATE POLICY "performance_competencies_select" ON public.performance_competencies
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "performance_competencies_write" ON public.performance_competencies;
CREATE POLICY "performance_competencies_write" ON public.performance_competencies
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_admin(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_admin(auth.uid()));

INSERT INTO public.performance_competencies (company_id, name, description, sort_order)
SELECT c.id, k.name, k.description, k.sort_order
FROM public.companies c
CROSS JOIN (VALUES
  ('Safety awareness', 'Follows SMS procedures, reports hazards, leads by example', 10),
  ('Technical competence', 'Skill and knowledge for the role and rank', 20),
  ('Reliability', 'Punctuality, follow-through, hours of rest discipline', 30),
  ('Teamwork', 'Supports the department and other departments', 40),
  ('Communication', 'Clear, timely and respectful with crew, guests and shore', 50),
  ('Guest service', 'Anticipates and meets owner and guest expectations', 60),
  ('Initiative', 'Identifies and solves problems without prompting', 70),
  ('Leadership', 'Develops others, sets standards, handles conflict', 80)
) AS k(name, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.performance_competencies pc WHERE pc.company_id = c.id)
ON CONFLICT (company_id, name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.performance_review_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  review_type text NOT NULL DEFAULT 'annual_evaluation'
    CHECK (review_type IN ('annual_evaluation', 'annual_review', 'end_of_rotation', 'probation', 'ad_hoc')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed')),
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_review_cycles_dates_chk CHECK (period_end >= period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_review_cycles TO authenticated;
GRANT ALL ON public.performance_review_cycles TO service_role;
ALTER TABLE public.performance_review_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "performance_review_cycles_select" ON public.performance_review_cycles;
CREATE POLICY "performance_review_cycles_select" ON public.performance_review_cycles
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "performance_review_cycles_write" ON public.performance_review_cycles;
CREATE POLICY "performance_review_cycles_write" ON public.performance_review_cycles
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_performance_review_cycles_updated_at ON public.performance_review_cycles;
CREATE TRIGGER trg_performance_review_cycles_updated_at BEFORE UPDATE ON public.performance_review_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cycle_id uuid REFERENCES public.performance_review_cycles(id) ON DELETE SET NULL,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  review_type text NOT NULL DEFAULT 'annual_evaluation'
    CHECK (review_type IN ('annual_evaluation', 'annual_review', 'end_of_rotation', 'probation', 'ad_hoc')),
  period_start date,
  period_end date,
  due_date date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'self_assessment', 'in_review', 'awaiting_acknowledgement', 'completed', 'cancelled')),
  ratings jsonb NOT NULL DEFAULT '[]'::jsonb,
  self_ratings jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_rating numeric(3,1) CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5)),
  strengths text,
  development_areas text,
  training_needs text,
  career_aspirations text,
  summary text,
  reviewer_comments text,
  employee_comments text,
  welfare_notes text,
  follow_up_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_review_date date,
  recommend_promotion boolean,
  recommend_pay_review boolean,
  retain boolean,
  submitted_at timestamptz,
  self_assessment_submitted_at timestamptz,
  reviewer_signed_at timestamptz,
  employee_acknowledged_at timestamptz,
  completed_at timestamptz,
  document_path text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_reviews TO authenticated;
GRANT ALL ON public.performance_reviews TO service_role;
CREATE INDEX IF NOT EXISTS idx_performance_reviews_profile ON public.performance_reviews(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_reviewer ON public.performance_reviews(reviewer_profile_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_company_due ON public.performance_reviews(company_id, due_date);
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "performance_reviews_select" ON public.performance_reviews;
CREATE POLICY "performance_reviews_select" ON public.performance_reviews
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.hr_can_view(auth.uid())
      OR reviewer_profile_id = public.my_profile_id()
      OR (profile_id = public.my_profile_id() AND status IN ('self_assessment', 'awaiting_acknowledgement', 'completed'))
    )
  );
DROP POLICY IF EXISTS "performance_reviews_insert" ON public.performance_reviews;
CREATE POLICY "performance_reviews_insert" ON public.performance_reviews
  FOR INSERT WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR reviewer_profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "performance_reviews_update" ON public.performance_reviews;
CREATE POLICY "performance_reviews_update" ON public.performance_reviews
  FOR UPDATE USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR reviewer_profile_id = public.my_profile_id())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR reviewer_profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "performance_reviews_delete" ON public.performance_reviews;
CREATE POLICY "performance_reviews_delete" ON public.performance_reviews
  FOR DELETE USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_admin(auth.uid()));
DROP TRIGGER IF EXISTS trg_performance_reviews_updated_at ON public.performance_reviews;
CREATE TRIGGER trg_performance_reviews_updated_at BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.performance_reviews_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type public.hr_record_type;
BEGIN
  v_type := CASE NEW.review_type
    WHEN 'annual_review' THEN 'annual_review'::public.hr_record_type
    WHEN 'end_of_rotation' THEN 'rotation_catchup'::public.hr_record_type
    ELSE 'performance_evaluation'::public.hr_record_type END;
  PERFORM public.hr_register_record(NEW.company_id, NEW.profile_id, v_type, NEW.id, 'performance_reviews',
    COALESCE(NEW.completed_at::date, NEW.period_end, NEW.due_date, CURRENT_DATE));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_performance_reviews_after_write ON public.performance_reviews;
CREATE TRIGGER trg_performance_reviews_after_write AFTER INSERT OR UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.performance_reviews_after_write();

CREATE OR REPLACE FUNCTION public.performance_review_submit_self_assessment(
  p_review_id uuid, p_self_ratings jsonb, p_employee_comments text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.performance_reviews;
BEGIN
  SELECT * INTO r FROM public.performance_reviews WHERE id = p_review_id;
  IF NOT FOUND OR r.profile_id <> public.my_profile_id() THEN RAISE EXCEPTION 'Review not found'; END IF;
  IF r.status <> 'self_assessment' THEN RAISE EXCEPTION 'Review is not open for self-assessment'; END IF;
  UPDATE public.performance_reviews
  SET self_ratings = COALESCE(p_self_ratings, '[]'::jsonb),
      employee_comments = p_employee_comments,
      self_assessment_submitted_at = now(),
      status = 'in_review',
      updated_at = now()
  WHERE id = p_review_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.performance_review_acknowledge(p_review_id uuid, p_employee_comments text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.performance_reviews;
BEGIN
  SELECT * INTO r FROM public.performance_reviews WHERE id = p_review_id;
  IF NOT FOUND OR r.profile_id <> public.my_profile_id() THEN RAISE EXCEPTION 'Review not found'; END IF;
  IF r.status <> 'awaiting_acknowledgement' THEN RAISE EXCEPTION 'Review is not awaiting acknowledgement'; END IF;
  UPDATE public.performance_reviews
  SET employee_acknowledged_at = now(),
      employee_comments = COALESCE(p_employee_comments, employee_comments),
      status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_review_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.crew_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_id uuid REFERENCES public.performance_reviews(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'performance'
    CHECK (category IN ('performance', 'development', 'training', 'behaviour', 'certification', 'career')),
  measure text,
  target_date date,
  weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'achieved', 'missed', 'cancelled')),
  linked_course_id uuid REFERENCES public.development_courses(id) ON DELETE SET NULL,
  linked_application_id uuid REFERENCES public.development_applications(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_objectives TO authenticated;
GRANT ALL ON public.crew_objectives TO service_role;
CREATE INDEX IF NOT EXISTS idx_crew_objectives_profile ON public.crew_objectives(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_crew_objectives_company_target ON public.crew_objectives(company_id, target_date);
ALTER TABLE public.crew_objectives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_objectives_select" ON public.crew_objectives;
CREATE POLICY "crew_objectives_select" ON public.crew_objectives
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_view(auth.uid()) OR profile_id = public.my_profile_id() OR owner_profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "crew_objectives_write" ON public.crew_objectives;
CREATE POLICY "crew_objectives_write" ON public.crew_objectives
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR profile_id = public.my_profile_id() OR owner_profile_id = public.my_profile_id())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR profile_id = public.my_profile_id() OR owner_profile_id = public.my_profile_id())
  );
DROP TRIGGER IF EXISTS trg_crew_objectives_updated_at ON public.crew_objectives;
CREATE TRIGGER trg_crew_objectives_updated_at BEFORE UPDATE ON public.crew_objectives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.crew_objective_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.crew_objectives(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  note text NOT NULL,
  progress_pct integer CHECK (progress_pct IS NULL OR progress_pct BETWEEN 0 AND 100),
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_objective_updates TO authenticated;
GRANT ALL ON public.crew_objective_updates TO service_role;
CREATE INDEX IF NOT EXISTS idx_crew_objective_updates_objective ON public.crew_objective_updates(objective_id);
ALTER TABLE public.crew_objective_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_objective_updates_select" ON public.crew_objective_updates;
CREATE POLICY "crew_objective_updates_select" ON public.crew_objective_updates
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.crew_objectives o WHERE o.id = objective_id));
DROP POLICY IF EXISTS "crew_objective_updates_insert" ON public.crew_objective_updates;
CREATE POLICY "crew_objective_updates_insert" ON public.crew_objective_updates
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.crew_objectives o WHERE o.id = objective_id));

CREATE OR REPLACE FUNCTION public.crew_objective_updates_after_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.progress_pct IS NOT NULL THEN
    UPDATE public.crew_objectives
    SET progress_pct = NEW.progress_pct,
        status = CASE WHEN NEW.progress_pct >= 100 THEN 'achieved' WHEN NEW.progress_pct > 0 AND status = 'not_started' THEN 'in_progress' ELSE status END,
        completed_at = CASE WHEN NEW.progress_pct >= 100 THEN COALESCE(completed_at, now()) ELSE completed_at END,
        updated_at = now()
    WHERE id = NEW.objective_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_crew_objective_updates_after_insert ON public.crew_objective_updates;
CREATE TRIGGER trg_crew_objective_updates_after_insert AFTER INSERT ON public.crew_objective_updates
  FOR EACH ROW EXECUTE FUNCTION public.crew_objective_updates_after_insert();

CREATE TABLE IF NOT EXISTS public.incident_involved_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  involvement text NOT NULL DEFAULT 'involved' CHECK (involvement IN ('involved', 'witness', 'injured', 'reporter', 'responsible')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, profile_id, involvement)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_involved_persons TO authenticated;
GRANT ALL ON public.incident_involved_persons TO service_role;
CREATE INDEX IF NOT EXISTS idx_incident_involved_persons_profile ON public.incident_involved_persons(profile_id);
ALTER TABLE public.incident_involved_persons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incident_involved_persons_select" ON public.incident_involved_persons;
CREATE POLICY "incident_involved_persons_select" ON public.incident_involved_persons
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id));
DROP POLICY IF EXISTS "incident_involved_persons_write" ON public.incident_involved_persons;
CREATE POLICY "incident_involved_persons_write" ON public.incident_involved_persons
  FOR ALL USING (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id) AND public.hr_can_edit(auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id) AND public.hr_can_edit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.disciplinary_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'conduct'
    CHECK (category IN ('conduct', 'safety', 'performance', 'attendance', 'substance', 'harassment', 'damage', 'other')),
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'serious', 'gross')),
  stage text NOT NULL DEFAULT 'investigation'
    CHECK (stage IN ('investigation', 'no_action', 'verbal_warning', 'written_warning', 'final_warning', 'suspension', 'demotion', 'dismissal')),
  description text NOT NULL,
  investigation_notes text,
  witness_statements text,
  outcome text,
  outcome_date date,
  issued_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expiry_date date,
  appeal_status text NOT NULL DEFAULT 'none' CHECK (appeal_status IN ('none', 'lodged', 'upheld', 'overturned')),
  appeal_notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'expired', 'overturned')),
  document_path text,
  document_name text,
  acknowledged_by_crew_at timestamptz,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_records TO authenticated;
GRANT ALL ON public.disciplinary_records TO service_role;
CREATE INDEX IF NOT EXISTS idx_disciplinary_records_profile ON public.disciplinary_records(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_disciplinary_records_company ON public.disciplinary_records(company_id, status, severity);
ALTER TABLE public.disciplinary_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "disciplinary_records_select" ON public.disciplinary_records;
CREATE POLICY "disciplinary_records_select" ON public.disciplinary_records
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.hr_can_edit(auth.uid())
      OR (profile_id = public.my_profile_id() AND stage <> 'investigation')
    )
  );
DROP POLICY IF EXISTS "disciplinary_records_write" ON public.disciplinary_records;
CREATE POLICY "disciplinary_records_write" ON public.disciplinary_records
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_disciplinary_records_updated_at ON public.disciplinary_records;
CREATE TRIGGER trg_disciplinary_records_updated_at BEFORE UPDATE ON public.disciplinary_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.disciplinary_records_self
WITH (security_invoker = true) AS
  SELECT id, company_id, profile_id, vessel_id, incident_date, category, severity, stage, description,
         outcome, outcome_date, expiry_date, appeal_status, status, acknowledged_by_crew_at, created_at
  FROM public.disciplinary_records;

CREATE OR REPLACE FUNCTION public.disciplinary_records_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.hr_register_record(
    NEW.company_id, NEW.profile_id,
    CASE WHEN NEW.severity = 'minor' THEN 'disciplinary_minor'::public.hr_record_type ELSE 'disciplinary_serious'::public.hr_record_type END,
    NEW.id, 'disciplinary_records', NEW.incident_date
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_disciplinary_records_after_write ON public.disciplinary_records;
CREATE TRIGGER trg_disciplinary_records_after_write AFTER INSERT OR UPDATE ON public.disciplinary_records
  FOR EACH ROW EXECUTE FUNCTION public.disciplinary_records_after_write();

CREATE OR REPLACE FUNCTION public.disciplinary_record_acknowledge(p_record_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.disciplinary_records;
BEGIN
  SELECT * INTO r FROM public.disciplinary_records WHERE id = p_record_id;
  IF NOT FOUND OR r.profile_id <> public.my_profile_id() THEN RAISE EXCEPTION 'Record not found'; END IF;
  UPDATE public.disciplinary_records SET acknowledged_by_crew_at = COALESCE(acknowledged_by_crew_at, now()), updated_at = now()
  WHERE id = p_record_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_expire_disciplinary_records()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.disciplinary_records SET status = 'expired', updated_at = now()
  WHERE status IN ('open', 'closed') AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE AND appeal_status <> 'lodged';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('hr-expire-disciplinary', '20 0 * * *', $cron$SELECT public.hr_expire_disciplinary_records()$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

INSERT INTO public.notification_types (key, name, category, cadence, description, sort_order) VALUES
  ('review_due', 'Performance Review Due', 'Crew', 'weekly', 'Evaluation, review or catch-up due within 14 days or overdue', 38),
  ('review_awaiting_you', 'Review Awaiting Your Action', 'Crew', 'realtime', 'A self-assessment or acknowledgement is waiting for you', 39),
  ('objective_due', 'Objective Due', 'Crew', 'weekly', 'Objective / PDP target date within 14 days or overdue', 40),
  ('disciplinary_expiring', 'Warning Expiring', 'Crew', 'weekly', 'A disciplinary warning lapses within 30 days', 41)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW public.hr_performance_due_items
WITH (security_invoker = true) AS
  SELECT 'review'::text AS item_type, r.id AS record_id, r.company_id, r.profile_id, p.user_id,
         p.first_name || ' ' || p.last_name AS crew_name, r.vessel_id,
         r.review_type AS label, r.status, r.due_date, (r.due_date - CURRENT_DATE) AS days_remaining
  FROM public.performance_reviews r JOIN public.profiles p ON p.id = r.profile_id
  WHERE r.status NOT IN ('completed', 'cancelled') AND r.due_date IS NOT NULL
UNION ALL
  SELECT 'objective', o.id, o.company_id, o.profile_id, p.user_id,
         p.first_name || ' ' || p.last_name, NULL::uuid,
         o.title, o.status, o.target_date, (o.target_date - CURRENT_DATE)
  FROM public.crew_objectives o JOIN public.profiles p ON p.id = o.profile_id
  WHERE o.status IN ('not_started', 'in_progress') AND o.target_date IS NOT NULL
UNION ALL
  SELECT 'warning', d.id, d.company_id, d.profile_id, p.user_id,
         p.first_name || ' ' || p.last_name, d.vessel_id,
         d.stage, d.status, d.expiry_date, (d.expiry_date - CURRENT_DATE)
  FROM public.disciplinary_records d JOIN public.profiles p ON p.id = d.profile_id
  WHERE d.status IN ('open', 'closed') AND d.expiry_date IS NOT NULL;