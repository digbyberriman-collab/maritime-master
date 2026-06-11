
-- Drop dependent policy first
DROP POLICY IF EXISTS "Authorized users can update applications" ON public.development_applications;

ALTER TABLE public.development_applications
  DROP CONSTRAINT IF EXISTS development_applications_status_check;
UPDATE public.development_applications SET status = 'hod_review' WHERE status = 'peer_review';
ALTER TABLE public.development_applications
  ADD CONSTRAINT development_applications_status_check
  CHECK (status = ANY (ARRAY[
    'draft','submitted','hod_review','purser_review','captain_review',
    'approved','enrolled','completed','returned','cancelled','discretionary_approved'
  ]));

ALTER TABLE public.development_applications
  DROP COLUMN IF EXISTS peer_reviewer_id,
  DROP COLUMN IF EXISTS peer_reviewed_at,
  DROP COLUMN IF EXISTS peer_decision,
  DROP COLUMN IF EXISTS peer_comments;

ALTER TABLE public.development_applications
  ADD COLUMN IF NOT EXISTS purser_reviewer_id uuid REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS purser_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS purser_decision text,
  ADD COLUMN IF NOT EXISTS purser_comments text,
  ADD COLUMN IF NOT EXISTS application_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS tuition_local_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accommodation_local_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_local_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_usd numeric(12,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS actual_tuition_usd numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_accommodation_usd numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_travel_usd numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_food_per_diem_usd numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS course_duration_hours numeric(6,2),
  ADD COLUMN IF NOT EXISTS is_online_short boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggested_alternative_course_id uuid REFERENCES public.development_courses(id),
  ADD COLUMN IF NOT EXISTS suggested_alternative_notes text,
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS clawback_end_date date,
  ADD COLUMN IF NOT EXISTS reported_to_fleet_at timestamptz;

ALTER TABLE public.development_applications
  DROP CONSTRAINT IF EXISTS dev_apps_purser_decision_check;
ALTER TABLE public.development_applications
  ADD CONSTRAINT dev_apps_purser_decision_check
  CHECK (purser_decision IS NULL OR purser_decision = ANY (ARRAY['approved','returned']));

-- Recreate update policy (now references purser_reviewer_id instead of peer)
CREATE POLICY "Authorized users can update applications"
  ON public.development_applications FOR UPDATE TO authenticated
  USING (
    user_belongs_to_company(auth.uid(), company_id) AND (
      crew_member_id = auth.uid()
      OR hod_reviewer_id = auth.uid()
      OR purser_reviewer_id = auth.uid()
      OR captain_reviewer_id = auth.uid()
      OR has_fleet_access(auth.uid())
    )
  );

-- development_courses tags
ALTER TABLE public.development_courses
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];

-- profiles probation
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS probation_end_date date;

-- program_settings
CREATE TABLE IF NOT EXISTS public.program_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  accommodation_cap_per_night_usd numeric(10,2) NOT NULL DEFAULT 250,
  food_per_diem_usd numeric(10,2) NOT NULL DEFAULT 50,
  professional_split_threshold_usd numeric(10,2) NOT NULL DEFAULT 4000,
  clawback_months integer NOT NULL DEFAULT 12,
  eligibility_service_days integer NOT NULL DEFAULT 90,
  probation_default_days integer NOT NULL DEFAULT 180,
  online_neutral_threshold_hours numeric(6,2) NOT NULL DEFAULT 24,
  anniversary_window_days integer NOT NULL DEFAULT 30,
  business_class_flights_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_settings TO authenticated;
GRANT ALL ON public.program_settings TO service_role;

ALTER TABLE public.program_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view program settings"
  ON public.program_settings FOR SELECT TO authenticated
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Fleet admin can manage program settings"
  ON public.program_settings FOR ALL TO authenticated
  USING (has_fleet_access(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (has_fleet_access(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER update_program_settings_updated_at
  BEFORE UPDATE ON public.program_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.program_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;
