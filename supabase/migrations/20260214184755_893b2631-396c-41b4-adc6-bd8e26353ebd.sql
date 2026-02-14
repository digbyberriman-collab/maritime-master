
-- =========================================================
-- CREW DEVELOPMENT MODULE — Database Schema
-- =========================================================

-- 1. Course Catalogue
CREATE TABLE public.development_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  catalogue_number INTEGER,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  sub_section TEXT,
  category TEXT NOT NULL CHECK (category IN ('fleet_organised', 'mandatory', 'professional', 'extracurricular')),
  format TEXT CHECK (format IN ('in_person', 'online', 'onboard', 'blended', 'online_in_person')),
  duration_description TEXT,
  renewal_period TEXT,
  reimbursement_summary TEXT,
  notes TEXT,
  contact_person TEXT,
  over_4k_rule BOOLEAN DEFAULT FALSE,
  requires_fleet_doctor_agreement BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Development Applications (CDA)
CREATE TABLE public.development_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  application_number TEXT UNIQUE NOT NULL DEFAULT '',
  crew_member_id UUID NOT NULL REFERENCES public.profiles(user_id),
  vessel_id UUID NOT NULL REFERENCES public.vessels(id),
  course_id UUID REFERENCES public.development_courses(id),
  course_name TEXT NOT NULL,
  course_provider TEXT,
  course_description TEXT,
  course_url TEXT,
  course_location TEXT,
  course_start_date DATE,
  course_end_date DATE,
  course_duration_days INTEGER,
  category TEXT NOT NULL CHECK (category IN ('fleet_organised', 'mandatory', 'professional', 'extracurricular')),
  is_custom_course BOOLEAN DEFAULT FALSE,
  estimated_tuition_usd DECIMAL(10,2) DEFAULT 0,
  estimated_accommodation_usd DECIMAL(10,2) DEFAULT 0,
  estimated_accommodation_nightly_rate DECIMAL(10,2) DEFAULT 0,
  estimated_accommodation_nights INTEGER DEFAULT 0,
  estimated_travel_usd DECIMAL(10,2) DEFAULT 0,
  estimated_travel_route TEXT,
  estimated_food_per_diem_usd DECIMAL(10,2) DEFAULT 0,
  estimated_total_usd DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(estimated_tuition_usd, 0) + COALESCE(estimated_accommodation_usd, 0) + COALESCE(estimated_travel_usd, 0) + COALESCE(estimated_food_per_diem_usd, 0)
  ) STORED,
  reimbursement_total_usd DECIMAL(10,2) DEFAULT 0,
  upfront_payment_by_inkfish DECIMAL(10,2) DEFAULT 0,
  leave_days_accrued INTEGER DEFAULT 0,
  neutral_days_accrued INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'hod_review', 'peer_review', 'captain_review',
    'approved', 'enrolled', 'completed', 'returned', 'cancelled', 'discretionary_approved'
  )),
  hod_reviewer_id UUID REFERENCES public.profiles(user_id),
  hod_reviewed_at TIMESTAMPTZ,
  hod_decision TEXT CHECK (hod_decision IN ('approved', 'returned')),
  hod_comments TEXT,
  peer_reviewer_id UUID REFERENCES public.profiles(user_id),
  peer_reviewed_at TIMESTAMPTZ,
  peer_decision TEXT CHECK (peer_decision IN ('approved', 'returned')),
  peer_comments TEXT,
  captain_reviewer_id UUID REFERENCES public.profiles(user_id),
  captain_reviewed_at TIMESTAMPTZ,
  captain_decision TEXT CHECK (captain_decision IN ('approved', 'returned', 'discretionary_approved')),
  captain_comments TEXT,
  is_discretionary BOOLEAN DEFAULT FALSE,
  discretionary_justification TEXT,
  completed_at TIMESTAMPTZ,
  completion_certificate_url TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Fleet Training Participants
CREATE TABLE public.fleet_training_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.development_applications(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES public.profiles(user_id),
  attendance_status TEXT DEFAULT 'assigned' CHECK (attendance_status IN ('assigned', 'confirmed', 'attended', 'absent')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Development Expenses
CREATE TABLE public.development_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  application_id UUID NOT NULL REFERENCES public.development_applications(id),
  crew_member_id UUID NOT NULL REFERENCES public.profiles(user_id),
  actual_tuition_usd DECIMAL(10,2) DEFAULT 0,
  actual_accommodation_usd DECIMAL(10,2) DEFAULT 0,
  actual_accommodation_nightly_rate DECIMAL(10,2) DEFAULT 0,
  actual_accommodation_nights INTEGER DEFAULT 0,
  actual_travel_usd DECIMAL(10,2) DEFAULT 0,
  actual_food_per_diem_usd DECIMAL(10,2) DEFAULT 0,
  actual_total_usd DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(actual_tuition_usd, 0) + COALESCE(actual_accommodation_usd, 0) + COALESCE(actual_travel_usd, 0) + COALESCE(actual_food_per_diem_usd, 0)
  ) STORED,
  approved_reimbursement_usd DECIMAL(10,2) DEFAULT 0,
  reimbursement_breakdown JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'under_review', 'approved', 'paid', 'partially_paid', 'rejected'
  )),
  reviewed_by UUID REFERENCES public.profiles(user_id),
  reviewed_at TIMESTAMPTZ,
  review_comments TEXT,
  paid_at TIMESTAMPTZ,
  is_split_payment BOOLEAN DEFAULT FALSE,
  upfront_amount_paid DECIMAL(10,2) DEFAULT 0,
  upfront_paid_at TIMESTAMPTZ,
  completion_amount_due DECIMAL(10,2) DEFAULT 0,
  completion_amount_paid DECIMAL(10,2) DEFAULT 0,
  completion_paid_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Development Documents
CREATE TABLE public.development_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.development_applications(id),
  expense_id UUID REFERENCES public.development_expenses(id),
  uploaded_by UUID NOT NULL REFERENCES public.profiles(user_id),
  document_type TEXT NOT NULL CHECK (document_type IN (
    'course_brochure', 'provider_quote', 'prerequisite_cert', 'completion_certificate',
    'tuition_receipt', 'accommodation_receipt', 'travel_receipt', 'food_receipt',
    'cda_signed_pdf', 'approval_pdf', 'other'
  )),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Repayment / Clawback Tracking
CREATE TABLE public.development_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  crew_member_id UUID NOT NULL REFERENCES public.profiles(user_id),
  expense_id UUID NOT NULL REFERENCES public.development_expenses(id),
  application_id UUID NOT NULL REFERENCES public.development_applications(id),
  total_reimbursed_usd DECIMAL(10,2) NOT NULL,
  reimbursement_date DATE NOT NULL,
  amortisation_end_date DATE NOT NULL,
  remaining_obligation_usd DECIMAL(10,2) NOT NULL,
  is_fully_amortised BOOLEAN DEFAULT FALSE,
  clawback_triggered BOOLEAN DEFAULT FALSE,
  clawback_triggered_at TIMESTAMPTZ,
  clawback_amount_usd DECIMAL(10,2),
  clawback_reason TEXT,
  clawback_settled BOOLEAN DEFAULT FALSE,
  clawback_settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Discussion / Comments
CREATE TABLE public.development_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.development_applications(id),
  author_id UUID NOT NULL REFERENCES public.profiles(user_id),
  content TEXT NOT NULL,
  is_system_message BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Audit Trail
CREATE TABLE public.development_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  application_id UUID REFERENCES public.development_applications(id),
  expense_id UUID REFERENCES public.development_expenses(id),
  actor_id UUID NOT NULL REFERENCES public.profiles(user_id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- Enable RLS on all tables
-- =========================================================
ALTER TABLE public.development_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_training_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_audit_log ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- RLS Policies
-- =========================================================

-- COURSES: All company members can browse; fleet admin can manage
CREATE POLICY "Company members can view courses"
  ON public.development_courses FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Fleet admin can insert courses"
  ON public.development_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_fleet_access(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Fleet admin can update courses"
  ON public.development_courses FOR UPDATE TO authenticated
  USING (public.has_fleet_access(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Fleet admin can delete courses"
  ON public.development_courses FOR DELETE TO authenticated
  USING (public.has_fleet_access(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

-- APPLICATIONS: Company members can view all in their company (HODs/Captains need visibility)
CREATE POLICY "Company members can view applications"
  ON public.development_applications FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Crew can create own applications"
  ON public.development_applications FOR INSERT TO authenticated
  WITH CHECK (crew_member_id = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Authorized users can update applications"
  ON public.development_applications FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      crew_member_id = auth.uid()
      OR hod_reviewer_id = auth.uid()
      OR peer_reviewer_id = auth.uid()
      OR captain_reviewer_id = auth.uid()
      OR public.has_fleet_access(auth.uid())
    )
  );

-- FLEET TRAINING PARTICIPANTS
CREATE POLICY "Company members can view participants"
  ON public.fleet_training_participants FOR SELECT TO authenticated
  USING (
    crew_member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.development_applications da
      WHERE da.id = application_id
      AND public.user_belongs_to_company(auth.uid(), da.company_id)
    )
  );

CREATE POLICY "Fleet admin can manage participants"
  ON public.fleet_training_participants FOR INSERT TO authenticated
  WITH CHECK (public.has_fleet_access(auth.uid()));

CREATE POLICY "Fleet admin can update participants"
  ON public.fleet_training_participants FOR UPDATE TO authenticated
  USING (public.has_fleet_access(auth.uid()));

CREATE POLICY "Fleet admin can delete participants"
  ON public.fleet_training_participants FOR DELETE TO authenticated
  USING (public.has_fleet_access(auth.uid()));

-- EXPENSES
CREATE POLICY "Users can view own or admin can view all expenses"
  ON public.development_expenses FOR SELECT TO authenticated
  USING (
    crew_member_id = auth.uid()
    OR public.has_fleet_access(auth.uid())
  );

CREATE POLICY "Crew can create own expenses"
  ON public.development_expenses FOR INSERT TO authenticated
  WITH CHECK (crew_member_id = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Authorized users can update expenses"
  ON public.development_expenses FOR UPDATE TO authenticated
  USING (
    crew_member_id = auth.uid()
    OR reviewed_by = auth.uid()
    OR public.has_fleet_access(auth.uid())
  );

-- DOCUMENTS
CREATE POLICY "Users can view related documents"
  ON public.development_documents FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.development_applications da
      WHERE da.id = application_id
      AND public.user_belongs_to_company(auth.uid(), da.company_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.development_expenses de
      WHERE de.id = expense_id
      AND public.user_belongs_to_company(auth.uid(), de.company_id)
    )
  );

CREATE POLICY "Authenticated users can upload documents"
  ON public.development_documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- REPAYMENTS
CREATE POLICY "Users can view own or admin can view repayments"
  ON public.development_repayments FOR SELECT TO authenticated
  USING (
    crew_member_id = auth.uid()
    OR public.has_fleet_access(auth.uid())
  );

CREATE POLICY "Fleet admin can insert repayments"
  ON public.development_repayments FOR INSERT TO authenticated
  WITH CHECK (public.has_fleet_access(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Fleet admin can update repayments"
  ON public.development_repayments FOR UPDATE TO authenticated
  USING (public.has_fleet_access(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

-- COMMENTS
CREATE POLICY "Company members can view comments on applications"
  ON public.development_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.development_applications da
      WHERE da.id = application_id
      AND public.user_belongs_to_company(auth.uid(), da.company_id)
    )
  );

CREATE POLICY "Authenticated users can add comments"
  ON public.development_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- AUDIT LOG
CREATE POLICY "Fleet admin can view audit log"
  ON public.development_audit_log FOR SELECT TO authenticated
  USING (
    public.has_fleet_access(auth.uid())
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "Authenticated users can insert audit entries"
  ON public.development_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id));

-- =========================================================
-- Indexes
-- =========================================================
CREATE INDEX idx_dev_courses_dept ON public.development_courses(department);
CREATE INDEX idx_dev_courses_cat ON public.development_courses(category);
CREATE INDEX idx_dev_courses_company ON public.development_courses(company_id);
CREATE INDEX idx_dev_apps_crew ON public.development_applications(crew_member_id);
CREATE INDEX idx_dev_apps_vessel ON public.development_applications(vessel_id);
CREATE INDEX idx_dev_apps_status ON public.development_applications(status);
CREATE INDEX idx_dev_apps_company ON public.development_applications(company_id);
CREATE INDEX idx_dev_expenses_app ON public.development_expenses(application_id);
CREATE INDEX idx_dev_expenses_company ON public.development_expenses(company_id);
CREATE INDEX idx_dev_repayments_crew ON public.development_repayments(crew_member_id);
CREATE INDEX idx_dev_repayments_amort ON public.development_repayments(amortisation_end_date) WHERE NOT is_fully_amortised;
CREATE INDEX idx_dev_docs_app ON public.development_documents(application_id);
CREATE INDEX idx_dev_docs_expense ON public.development_documents(expense_id);
CREATE INDEX idx_dev_comments_app ON public.development_comments(application_id);
CREATE INDEX idx_dev_audit_app ON public.development_audit_log(application_id);

-- =========================================================
-- Triggers
-- =========================================================

-- Auto-generate application numbers
CREATE OR REPLACE FUNCTION public.generate_dev_application_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(application_number, '-', 3) AS INTEGER)
  ), 0) + 1 INTO seq_num
  FROM development_applications
  WHERE company_id = NEW.company_id;

  NEW.application_number := 'CDA-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dev_application_number
  BEFORE INSERT ON public.development_applications
  FOR EACH ROW
  WHEN (NEW.application_number IS NULL OR NEW.application_number = '')
  EXECUTE FUNCTION public.generate_dev_application_number();

-- updated_at triggers
CREATE TRIGGER update_dev_courses_updated_at
  BEFORE UPDATE ON public.development_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dev_applications_updated_at
  BEFORE UPDATE ON public.development_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dev_expenses_updated_at
  BEFORE UPDATE ON public.development_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dev_repayments_updated_at
  BEFORE UPDATE ON public.development_repayments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Storage bucket for development documents
-- =========================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('development-documents', 'development-documents', false);

CREATE POLICY "Users can upload development docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'development-documents');

CREATE POLICY "Users can view development docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'development-documents');

CREATE POLICY "Users can update own development docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'development-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own development docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'development-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
