
CREATE TABLE public.notification_types (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('realtime','daily','weekly')),
  description TEXT,
  default_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_types readable to authenticated"
  ON public.notification_types FOR SELECT TO authenticated USING (true);

CREATE TABLE public.notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  notification_type_key TEXT NOT NULL REFERENCES public.notification_types(key) ON DELETE CASCADE,
  user_id UUID,
  email TEXT,
  vessel_scope TEXT NOT NULL DEFAULT 'all' CHECK (vessel_scope IN ('all','specific')),
  vessel_ids UUID[] NOT NULL DEFAULT '{}',
  channels JSONB NOT NULL DEFAULT '{"in_app":true,"email":true}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX idx_notif_subs_company ON public.notification_subscriptions(company_id);
CREATE INDEX idx_notif_subs_type ON public.notification_subscriptions(notification_type_key);
ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_subs select same company"
  ON public.notification_subscriptions FOR SELECT TO authenticated
  USING (company_id = public.current_user_company_id());
CREATE POLICY "notif_subs insert by dpa/superadmin"
  ON public.notification_subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_user_company_id()
    AND (public.has_role(auth.uid(), 'dpa'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role))
  );
CREATE POLICY "notif_subs update by dpa/superadmin"
  ON public.notification_subscriptions FOR UPDATE TO authenticated
  USING (
    company_id = public.current_user_company_id()
    AND (public.has_role(auth.uid(), 'dpa'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role))
  );
CREATE POLICY "notif_subs delete by dpa/superadmin"
  ON public.notification_subscriptions FOR DELETE TO authenticated
  USING (
    company_id = public.current_user_company_id()
    AND (public.has_role(auth.uid(), 'dpa'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role))
  );
CREATE TRIGGER trg_notif_subs_updated
  BEFORE UPDATE ON public.notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  notification_type_key TEXT NOT NULL REFERENCES public.notification_types(key) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_type_key)
);
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_notif_prefs select own" ON public.user_notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_notif_prefs insert own" ON public.user_notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_notif_prefs update own" ON public.user_notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_notif_prefs delete own" ON public.user_notification_preferences
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_user_notif_prefs_updated
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.notification_types (key, name, category, cadence, description, sort_order) VALUES
  ('vessel_certificate_expiries','Vessel Certificate Expiries','Certificates','weekly','Weekly digest of vessel certificates expiring or expired',10),
  ('charter_ending_soon','Charter Ending Soon','Charter','weekly','Charter ending within 2 days',20),
  ('charter_starting_soon','Charter Starting Soon','Charter','weekly','Charter starting within 7 days',21),
  ('crew_certificate_expiries','Crew Certificate Expiries','Crew','weekly','Weekly digest of crew certificates expiring or expired',30),
  ('crew_changes','Crew Changes','Crew','realtime','A crew member joins, leaves, or transfers',31),
  ('crew_qualification_expiring','Crew Qualification Expiring','Crew','weekly','Crew qualification approaching expiry',32),
  ('familiarization_not_completed','Familiarization Not Completed','Crew','weekly','Familiarization checklist overdue',33),
  ('leave_requests','Leave Requests','Crew','realtime','New leave request submitted',34),
  ('checklist_approval_required','Checklist Approval Required','Safety','realtime','A completed checklist is awaiting approval',40),
  ('checklist_completed','Checklist Completed','Safety','realtime','A safety checklist has been completed and may require approval',41),
  ('corrective_action_overdue','Corrective Action Overdue','Safety','weekly','A CAPA item is past its due date',42),
  ('permit_to_work','Permit to Work','Safety','realtime','A permit to work has been issued or approved',43),
  ('required_reading','Required Reading','Safety','realtime','A fleet document was issued that requires acknowledgement from the vessel',44),
  ('risk_assessment_approval_required','Risk Assessment Approval Required','Safety','realtime','A risk assessment is awaiting approval',45),
  ('safety_drill_due_soon','Safety Drill Due Soon','Safety','weekly','A SOLAS drill is due within 7 days',46),
  ('safety_drill_overdue','Safety Drill Overdue','Safety','weekly','A SOLAS drill is past its due date',47),
  ('safety_form_activity','Safety Form Activity','Safety','realtime','New activity on a safety form submission',48),
  ('critical_task_created','Critical Task Created','Technical','realtime','A critical maintenance task has been created',50),
  ('defective_critical_equipment','Defective Critical Equipment','Technical','realtime','Critical equipment has been flagged as defective',51),
  ('maintenance_task_due_soon','Maintenance Task Due Soon','Technical','weekly','Maintenance task due within 7 days',52),
  ('maintenance_task_overdue','Maintenance Task Overdue','Technical','weekly','Maintenance task past its due date',53),
  ('running_hours_threshold','Running Hours Threshold','Technical','weekly','Equipment running hours approaching service threshold',54),
  ('spare_parts_low_stock','Spare Parts Low Stock','Technical','weekly','Spare parts inventory below minimum stock',55),
  ('task_completed','Task Completed','Technical','realtime','A maintenance task has been completed',56),
  ('vessel_position_alert','Vessel Position Alert','Vessel','realtime','Vessel position deviates from expected route',60),
  ('fleet_report_ready','Fleet Report Ready','Reports','weekly','A scheduled fleet report has been generated',70);

INSERT INTO public.modules (key, name, description, sort_order, is_active) VALUES
  ('crew.see_crew_list','Can see crew list','View the crew roster',900,true),
  ('crew.view_crew_profiles','Can view crew profiles','Open individual crew profiles',901,true),
  ('crew.edit_crew_profiles','Can edit crew profiles','Modify crew profile data',902,true),
  ('crew.view_scheduling','Can view scheduling dashboard','Read-only scheduling access',903,true),
  ('crew.access_leave_records','Can access leave records','View leave records',904,true),
  ('crew.view_medical','Can view medical information','View sensitive medical fields',905,true),
  ('crew.edit_medical','Can edit medical information','Edit sensitive medical fields',906,true),
  ('crew.access_employment_records','Can access employment records','View contracts, salary, employment history',907,true),
  ('crew.view_appraisals','Can view appraisals','View completed appraisals',908,true),
  ('crew.conduct_appraisals','Can conduct appraisals','Create or sign appraisals',920,true),
  ('crew.approve_leave','Can approve leave requests',NULL,921,true),
  ('crew.approve_hours_of_rest','Can approve hours of rest submissions',NULL,922,true),
  ('crew.approve_payroll','Can approve payroll runs',NULL,923,true),
  ('crew.approve_expenses','Can approve expenses',NULL,924,true),
  ('crew.mark_expenses_paid','Can mark expenses paid',NULL,925,true),
  ('crew.approve_invoices','Can approve invoices',NULL,926,true),
  ('crew.record_invoice_payments','Can record invoice payments',NULL,927,true)
ON CONFLICT (key) DO NOTHING;
