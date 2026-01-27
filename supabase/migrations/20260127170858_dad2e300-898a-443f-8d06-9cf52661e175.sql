-- =============================================
-- DATA MODEL ENHANCEMENTS - PHASE 1
-- Fleet Groups, Company Extensions, Vessel Extensions
-- =============================================

-- Extend companies table with DPA and manager details
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS company_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS dpa_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS dpa_phone_24_7 VARCHAR(50),
ADD COLUMN IF NOT EXISTS dpa_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS technical_manager_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS technical_manager_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS crewing_manager_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS crewing_manager_phone VARCHAR(50);

-- Fleet Groups table
CREATE TABLE IF NOT EXISTS public.fleet_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  color_hex VARCHAR(7) DEFAULT '#3B82F6',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.fleet_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view fleet groups in their company"
  ON public.fleet_groups FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "DPA and Superadmin can manage fleet groups"
  ON public.fleet_groups FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::public.app_role[]));

-- Extend vessels table
ALTER TABLE public.vessels
ADD COLUMN IF NOT EXISTS fleet_group_id UUID REFERENCES public.fleet_groups(id),
ADD COLUMN IF NOT EXISTS mmsi VARCHAR(20),
ADD COLUMN IF NOT EXISTS call_sign VARCHAR(20),
ADD COLUMN IF NOT EXISTS home_port VARCHAR(255),
ADD COLUMN IF NOT EXISTS length_overall DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS beam DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS draft DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS builder VARCHAR(255),
ADD COLUMN IF NOT EXISTS operational_status VARCHAR(50) DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS emergency_primary_contact_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS emergency_primary_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS emergency_primary_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS emergency_secondary_contact_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS emergency_secondary_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS emergency_secondary_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS mrcc_contact_info TEXT,
ADD COLUMN IF NOT EXISTS flag_state_emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS class_emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS medical_support_contact TEXT,
ADD COLUMN IF NOT EXISTS security_support_contact TEXT,
ADD COLUMN IF NOT EXISTS nearest_port_agent_contact TEXT,
ADD COLUMN IF NOT EXISTS minimum_safe_manning JSONB,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(user_id);

-- Extend profiles table with missing fields
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS position VARCHAR(100),
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_invited_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS invitation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS invitation_token TEXT,
ADD COLUMN IF NOT EXISTS invitation_token_expires TIMESTAMP WITH TIME ZONE;

-- Extend crew_assignments table
ALTER TABLE public.crew_assignments
ADD COLUMN IF NOT EXISTS department VARCHAR(50),
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(50) DEFAULT 'PERMANENT',
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(user_id);

-- AIS Snapshots table
CREATE TABLE IF NOT EXISTS public.ais_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(11,7),
  sog DECIMAL(5,2),
  cog DECIMAL(5,2),
  heading DECIMAL(5,2),
  nav_status VARCHAR(50),
  timestamp_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  source_provider VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ais_vessel_time ON public.ais_snapshots(vessel_id, timestamp_utc DESC);

ALTER TABLE public.ais_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view AIS for company vessels"
  ON public.ais_snapshots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vessels v 
    WHERE v.id = vessel_id 
    AND public.user_belongs_to_company(auth.uid(), v.company_id)
  ));

-- Daily Crew Snapshots table
CREATE TABLE IF NOT EXISTS public.daily_crew_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE NOT NULL,
  snapshot_date DATE NOT NULL,
  crew_onboard_count INTEGER NOT NULL,
  captain_user_id UUID REFERENCES public.profiles(user_id),
  captain_name VARCHAR(255),
  is_acting_captain BOOLEAN DEFAULT false,
  source VARCHAR(20) DEFAULT 'COMPUTED',
  computed_at TIMESTAMP WITH TIME ZONE,
  override_reason TEXT,
  overridden_by UUID REFERENCES public.profiles(user_id),
  overridden_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(vessel_id, snapshot_date)
);

ALTER TABLE public.daily_crew_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view crew snapshots for company vessels"
  ON public.daily_crew_snapshots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vessels v 
    WHERE v.id = vessel_id 
    AND public.user_belongs_to_company(auth.uid(), v.company_id)
  ));

-- Medical Reports table
CREATE TABLE IF NOT EXISTS public.medical_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
  crew_id UUID REFERENCES public.profiles(user_id),
  vessel_id UUID REFERENCES public.vessels(id),
  report_number VARCHAR(50) UNIQUE NOT NULL,
  injury_type VARCHAR(100),
  body_part_affected VARCHAR(100),
  treatment_given TEXT,
  medical_attention_required BOOLEAN,
  time_off_work_days INTEGER,
  is_anonymized_for_fleet BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES public.profiles(user_id)
);

ALTER TABLE public.medical_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Medical reports visible to authorized users"
  ON public.medical_reports FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[])
    OR crew_id = auth.uid()
  );

CREATE POLICY "DPA and Captain can manage medical reports"
  ON public.medical_reports FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[]));

-- Extend incidents table
ALTER TABLE public.incidents
ADD COLUMN IF NOT EXISTS immediate_cause TEXT,
ADD COLUMN IF NOT EXISTS cause_categories TEXT[],
ADD COLUMN IF NOT EXISTS involved_crew_ids UUID[],
ADD COLUMN IF NOT EXISTS witness_crew_ids UUID[],
ADD COLUMN IF NOT EXISTS injuries_reported BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS no_investigation_reason TEXT,
ADD COLUMN IF NOT EXISTS no_investigation_approved_by UUID REFERENCES public.profiles(user_id),
ADD COLUMN IF NOT EXISTS no_investigation_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS shipping_master_notified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS shipping_master_message TEXT,
ADD COLUMN IF NOT EXISTS dpa_notified_at TIMESTAMP WITH TIME ZONE;

-- Flight Requests table
CREATE TABLE IF NOT EXISTS public.flight_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID REFERENCES public.profiles(user_id) NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id),
  company_id UUID REFERENCES public.companies(id) NOT NULL,
  request_number VARCHAR(50) UNIQUE NOT NULL,
  request_type VARCHAR(50) NOT NULL,
  depart_from VARCHAR(255) NOT NULL,
  arrive_to VARCHAR(255) NOT NULL,
  earliest_departure_date DATE NOT NULL,
  latest_departure_date DATE,
  preferred_airline VARCHAR(255),
  baggage_notes TEXT,
  passport_nationality VARCHAR(100),
  visa_requirements TEXT,
  assigned_agent_id UUID REFERENCES public.profiles(user_id),
  status VARCHAR(20) DEFAULT 'DRAFT',
  approved_by UUID REFERENCES public.profiles(user_id),
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.flight_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flight requests"
  ON public.flight_requests FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'travel_agent']::public.app_role[])
  );

CREATE POLICY "Authorized users can manage flight requests"
  ON public.flight_requests FOR ALL
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[])
  );

-- Flight Bookings table
CREATE TABLE IF NOT EXISTS public.flight_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_request_id UUID REFERENCES public.flight_requests(id) ON DELETE CASCADE NOT NULL,
  airline VARCHAR(255),
  flight_number VARCHAR(50),
  depart_airport VARCHAR(10),
  arrive_airport VARCHAR(10),
  depart_datetime_utc TIMESTAMP WITH TIME ZONE,
  arrive_datetime_utc TIMESTAMP WITH TIME ZONE,
  booking_reference VARCHAR(100),
  ticket_number VARCHAR(100),
  seat_number VARCHAR(20),
  cost_amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  booked_by UUID REFERENCES public.profiles(user_id),
  booked_at TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  itinerary_file_url TEXT,
  travel_letter_file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.flight_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Flight bookings viewable by request owner and staff"
  ON public.flight_bookings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.flight_requests fr
    WHERE fr.id = flight_request_id
    AND (fr.crew_id = auth.uid() 
      OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'travel_agent']::public.app_role[]))
  ));

CREATE POLICY "Travel agents and DPA can manage bookings"
  ON public.flight_bookings FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'travel_agent']::public.app_role[]));

-- Hours of Rest Records table
CREATE TABLE IF NOT EXISTS public.hours_of_rest_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID REFERENCES public.profiles(user_id) NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id) NOT NULL,
  record_date DATE NOT NULL,
  rest_periods JSONB NOT NULL,
  total_rest_hours DECIMAL(4,2),
  total_work_hours DECIMAL(4,2),
  is_compliant BOOLEAN,
  violations JSONB,
  signed_by_crew BOOLEAN DEFAULT false,
  signed_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES public.profiles(user_id),
  notes TEXT,
  UNIQUE(crew_id, record_date)
);

ALTER TABLE public.hours_of_rest_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rest records"
  ON public.hours_of_rest_records FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[])
  );

CREATE POLICY "Users can manage own rest records"
  ON public.hours_of_rest_records FOR ALL
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[])
  );

-- Leave Requests table
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID REFERENCES public.profiles(user_id) NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id),
  leave_type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  travel_days_before INTEGER DEFAULT 0,
  travel_days_after INTEGER DEFAULT 0,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  approved_by UUID REFERENCES public.profiles(user_id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own leave requests"
  ON public.leave_requests FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[])
  );

CREATE POLICY "Users can create own leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (crew_id = auth.uid());

CREATE POLICY "Authorized users can manage leave requests"
  ON public.leave_requests FOR UPDATE
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[])
  );

-- Notification Logs table
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES public.profiles(user_id),
  recipient_email VARCHAR(255),
  notification_type VARCHAR(50) NOT NULL,
  template_name VARCHAR(100),
  subject VARCHAR(255),
  body_preview TEXT,
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  status VARCHAR(20) DEFAULT 'PENDING',
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  provider VARCHAR(50),
  provider_message_id VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notification_logs FOR SELECT
  USING (
    recipient_user_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::public.app_role[])
  );

-- Planner Periods table
CREATE TABLE IF NOT EXISTS public.planner_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE NOT NULL,
  period_type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  location VARCHAR(255),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'PLANNED',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.planner_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view planner periods for company vessels"
  ON public.planner_periods FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vessels v 
    WHERE v.id = vessel_id 
    AND public.user_belongs_to_company(auth.uid(), v.company_id)
  ));

CREATE POLICY "DPA and Captain can manage planner periods"
  ON public.planner_periods FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[]));

-- Add triggers for updated_at
CREATE TRIGGER update_flight_requests_updated_at
  BEFORE UPDATE ON public.flight_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();