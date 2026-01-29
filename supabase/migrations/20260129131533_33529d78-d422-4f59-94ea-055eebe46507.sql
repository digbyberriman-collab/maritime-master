-- ============================================
-- Crew Travel & Admin Module Schema
-- ============================================

-- 1. Quarantine Houses Table (no dependencies)
CREATE TABLE public.quarantine_houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Location
  name TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state_province TEXT,
  postal_code TEXT,
  country TEXT NOT NULL,
  
  -- Coordinates (for mapping)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Capacity
  total_rooms INT NOT NULL DEFAULT 1,
  total_beds INT NOT NULL DEFAULT 2,
  
  -- Contact
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  
  -- Amenities
  wifi_available BOOLEAN DEFAULT true,
  kitchen_available BOOLEAN DEFAULT false,
  laundry_available BOOLEAN DEFAULT false,
  parking_available BOOLEAN DEFAULT false,
  airport_transfer_available BOOLEAN DEFAULT false,
  
  -- Costs
  daily_rate DECIMAL(10,2),
  rate_currency TEXT DEFAULT 'USD',
  includes_meals BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Notes
  check_in_instructions TEXT,
  house_rules TEXT,
  notes TEXT,
  
  -- Files
  photos JSONB DEFAULT '[]',
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qhouse_company ON public.quarantine_houses(company_id);
CREATE INDEX idx_qhouse_city ON public.quarantine_houses(city);
CREATE INDEX idx_qhouse_country ON public.quarantine_houses(country);

-- 2. Crew Travel Records Table
CREATE TABLE public.crew_travel_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  
  -- Travel Details
  travel_type TEXT NOT NULL CHECK (travel_type IN ('join', 'leave', 'rotation', 'training', 'medical', 'other')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'booked', 'confirmed', 'in_transit', 'completed', 'cancelled')),
  
  -- Dates
  departure_date DATE NOT NULL,
  arrival_date DATE,
  
  -- Locations
  origin_city TEXT,
  origin_country TEXT,
  origin_airport_code TEXT,
  destination_city TEXT,
  destination_country TEXT,
  destination_airport_code TEXT,
  
  -- Vessel Join/Leave
  joining_vessel BOOLEAN DEFAULT false,
  leaving_vessel BOOLEAN DEFAULT false,
  handover_notes TEXT,
  
  -- Logistics
  pickup_required BOOLEAN DEFAULT false,
  pickup_location TEXT,
  pickup_time TIMESTAMPTZ,
  accommodation_required BOOLEAN DEFAULT false,
  accommodation_id UUID REFERENCES public.quarantine_houses(id) ON DELETE SET NULL,
  
  -- Admin
  travel_agent TEXT,
  booking_reference TEXT,
  total_cost DECIMAL(10,2),
  cost_currency TEXT DEFAULT 'USD',
  notes TEXT,
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_travel_company ON public.crew_travel_records(company_id);
CREATE INDEX idx_travel_crew ON public.crew_travel_records(crew_member_id);
CREATE INDEX idx_travel_date ON public.crew_travel_records(departure_date);
CREATE INDEX idx_travel_vessel ON public.crew_travel_records(vessel_id);
CREATE INDEX idx_travel_status ON public.crew_travel_records(status);

-- 3. Crew Travel Documents Table
CREATE TABLE public.crew_travel_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  travel_record_id UUID REFERENCES public.crew_travel_records(id) ON DELETE SET NULL,
  
  -- Document Info
  document_type TEXT NOT NULL CHECK (document_type IN (
    'flight_ticket', 'e_ticket', 'boarding_pass', 'itinerary',
    'visa', 'visa_letter', 'invitation_letter', 'travel_letter',
    'travel_insurance', 'covid_certificate', 'vaccination_record',
    'pcr_test', 'health_declaration', 'quarantine_exemption',
    'receipt', 'expense', 'other'
  )),
  
  -- Original File
  original_filename TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  
  -- Standardised Naming
  standardised_filename TEXT,
  standardised_file_path TEXT,
  
  -- Extracted Metadata
  extracted_data JSONB DEFAULT '{}',
  extraction_status TEXT DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed', 'manual')),
  extraction_error TEXT,
  
  -- Travel Context
  travel_date DATE,
  origin_location TEXT,
  destination_location TEXT,
  
  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  
  -- Expiry (for visas, insurance)
  valid_from DATE,
  valid_until DATE,
  
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_travel_doc_company ON public.crew_travel_documents(company_id);
CREATE INDEX idx_travel_doc_crew ON public.crew_travel_documents(crew_member_id);
CREATE INDEX idx_travel_doc_type ON public.crew_travel_documents(document_type);
CREATE INDEX idx_travel_doc_travel ON public.crew_travel_documents(travel_record_id);
CREATE INDEX idx_travel_doc_status ON public.crew_travel_documents(extraction_status);

-- 4. Flight Segments Table
CREATE TABLE public.flight_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_record_id UUID NOT NULL REFERENCES public.crew_travel_records(id) ON DELETE CASCADE,
  
  -- Flight Details
  segment_order INT NOT NULL DEFAULT 1,
  airline_name TEXT,
  airline_code TEXT,
  flight_number TEXT,
  
  -- Departure
  departure_airport_code TEXT NOT NULL,
  departure_airport_name TEXT,
  departure_city TEXT,
  departure_country TEXT,
  departure_datetime TIMESTAMPTZ NOT NULL,
  departure_terminal TEXT,
  
  -- Arrival
  arrival_airport_code TEXT NOT NULL,
  arrival_airport_name TEXT,
  arrival_city TEXT,
  arrival_country TEXT,
  arrival_datetime TIMESTAMPTZ NOT NULL,
  arrival_terminal TEXT,
  
  -- Booking
  booking_class TEXT,
  seat_number TEXT,
  ticket_number TEXT,
  e_ticket_number TEXT,
  pnr_locator TEXT,
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'checked_in', 'boarding', 'departed', 'arrived', 'delayed', 'cancelled')),
  
  -- Extracted Data
  extracted_from_document UUID REFERENCES public.crew_travel_documents(id) ON DELETE SET NULL,
  extraction_confidence DECIMAL(3,2),
  manually_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flight_travel ON public.flight_segments(travel_record_id);
CREATE INDEX idx_flight_datetime ON public.flight_segments(departure_datetime);
CREATE INDEX idx_flight_status ON public.flight_segments(status);

-- 5. Pre-Departure Checklists Table
CREATE TABLE public.pre_departure_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  travel_record_id UUID NOT NULL REFERENCES public.crew_travel_records(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  
  -- Health Requirements
  medical_fit_to_travel BOOLEAN,
  medical_certificate_id UUID REFERENCES public.crew_travel_documents(id) ON DELETE SET NULL,
  
  vaccination_status TEXT CHECK (vaccination_status IN ('up_to_date', 'partial', 'exempt', 'unknown')),
  vaccination_document_id UUID REFERENCES public.crew_travel_documents(id) ON DELETE SET NULL,
  
  covid_test_required BOOLEAN DEFAULT false,
  covid_test_type TEXT CHECK (covid_test_type IN ('pcr', 'rapid_antigen', 'none')),
  covid_test_result TEXT CHECK (covid_test_result IN ('negative', 'positive', 'pending', 'not_required')),
  covid_test_date DATE,
  covid_test_document_id UUID REFERENCES public.crew_travel_documents(id) ON DELETE SET NULL,
  
  quarantine_required BOOLEAN DEFAULT false,
  quarantine_days INT,
  quarantine_location_id UUID REFERENCES public.quarantine_houses(id) ON DELETE SET NULL,
  
  -- Document Requirements
  passport_valid BOOLEAN,
  passport_expiry_ok BOOLEAN,
  visa_required BOOLEAN,
  visa_obtained BOOLEAN,
  visa_document_id UUID REFERENCES public.crew_travel_documents(id) ON DELETE SET NULL,
  
  seamans_book_valid BOOLEAN,
  certificates_valid BOOLEAN,
  
  -- Travel Documents
  flight_ticket_received BOOLEAN DEFAULT false,
  itinerary_sent BOOLEAN DEFAULT false,
  travel_insurance_valid BOOLEAN,
  
  -- Briefing
  joining_instructions_sent BOOLEAN DEFAULT false,
  joining_instructions_acknowledged BOOLEAN DEFAULT false,
  emergency_contacts_confirmed BOOLEAN DEFAULT false,
  
  -- Overall Status
  checklist_status TEXT DEFAULT 'incomplete' CHECK (checklist_status IN ('incomplete', 'pending_review', 'approved', 'issues_found')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_predep_company ON public.pre_departure_checklists(company_id);
CREATE INDEX idx_predep_travel ON public.pre_departure_checklists(travel_record_id);
CREATE INDEX idx_predep_crew ON public.pre_departure_checklists(crew_member_id);
CREATE INDEX idx_predep_status ON public.pre_departure_checklists(checklist_status);

-- 6. Quarantine Bookings Table
CREATE TABLE public.quarantine_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quarantine_house_id UUID NOT NULL REFERENCES public.quarantine_houses(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  travel_record_id UUID REFERENCES public.crew_travel_records(id) ON DELETE SET NULL,
  
  -- Dates
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  actual_check_in TIMESTAMPTZ,
  actual_check_out TIMESTAMPTZ,
  
  -- Room Assignment
  room_number TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  
  -- Costs
  total_nights INT,
  total_cost DECIMAL(10,2),
  cost_currency TEXT DEFAULT 'USD',
  paid BOOLEAN DEFAULT false,
  
  -- Provisioning
  dietary_requirements TEXT,
  special_requests TEXT,
  
  -- Notes
  notes TEXT,
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_booking_dates CHECK (check_out_date > check_in_date)
);

CREATE INDEX idx_qbooking_company ON public.quarantine_bookings(company_id);
CREATE INDEX idx_qbooking_house ON public.quarantine_bookings(quarantine_house_id);
CREATE INDEX idx_qbooking_crew ON public.quarantine_bookings(crew_member_id);
CREATE INDEX idx_qbooking_dates ON public.quarantine_bookings(check_in_date, check_out_date);
CREATE INDEX idx_qbooking_status ON public.quarantine_bookings(status);

-- 7. Document Naming Rules Table
CREATE TABLE public.document_naming_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  
  document_type TEXT NOT NULL,
  naming_pattern TEXT NOT NULL,
  folder_structure TEXT NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_naming_rules_company ON public.document_naming_rules(company_id);

-- Insert default naming rules (global)
INSERT INTO public.document_naming_rules (document_type, naming_pattern, folder_structure, company_id) VALUES
  ('flight_ticket', '{crew_name}_{travel_date}_{origin}-{destination}_FlightTicket', 'crew/{crew_id}/travel/{year}/{month}', NULL),
  ('e_ticket', '{crew_name}_{travel_date}_{origin}-{destination}_ETicket', 'crew/{crew_id}/travel/{year}/{month}', NULL),
  ('boarding_pass', '{crew_name}_{travel_date}_{flight_number}_BoardingPass', 'crew/{crew_id}/travel/{year}/{month}', NULL),
  ('visa', '{crew_name}_{country}_Visa_{valid_until}', 'crew/{crew_id}/visas', NULL),
  ('visa_letter', '{crew_name}_{travel_date}_{destination}_VisaLetter', 'crew/{crew_id}/travel/{year}/{month}', NULL),
  ('travel_letter', '{crew_name}_{travel_date}_TravelLetter', 'crew/{crew_id}/travel/{year}/{month}', NULL),
  ('covid_certificate', '{crew_name}_CovidCert_{date}', 'crew/{crew_id}/health', NULL),
  ('pcr_test', '{crew_name}_PCR_{date}', 'crew/{crew_id}/health', NULL),
  ('travel_insurance', '{crew_name}_TravelInsurance_{valid_from}-{valid_until}', 'crew/{crew_id}/insurance', NULL);

-- Enable RLS on all tables
ALTER TABLE public.quarantine_houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_travel_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_travel_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_departure_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarantine_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_naming_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quarantine_houses
CREATE POLICY "Users can view quarantine houses in their company" ON public.quarantine_houses
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "DPA/Fleet Master can manage quarantine houses" ON public.quarantine_houses
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid()) 
    AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master']::app_role[])
  );

-- RLS Policies for crew_travel_records
CREATE POLICY "Users can view travel records in their company" ON public.crew_travel_records
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can manage their own travel records" ON public.crew_travel_records
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid()) 
    AND (
      crew_member_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain', 'purser']::app_role[])
    )
  );

-- RLS Policies for crew_travel_documents
CREATE POLICY "Users can view travel documents in their company" ON public.crew_travel_documents
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can manage travel documents" ON public.crew_travel_documents
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid()) 
    AND (
      crew_member_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain', 'purser']::app_role[])
    )
  );

-- RLS Policies for flight_segments
CREATE POLICY "Users can view flight segments via travel records" ON public.flight_segments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crew_travel_records tr 
      WHERE tr.id = travel_record_id 
      AND tr.company_id = public.get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Authorized users can manage flight segments" ON public.flight_segments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crew_travel_records tr 
      WHERE tr.id = travel_record_id 
      AND tr.company_id = public.get_user_company_id(auth.uid())
      AND (
        tr.crew_member_id = auth.uid()
        OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain', 'purser']::app_role[])
      )
    )
  );

-- RLS Policies for pre_departure_checklists
CREATE POLICY "Users can view pre-departure checklists in their company" ON public.pre_departure_checklists
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Authorized users can manage pre-departure checklists" ON public.pre_departure_checklists
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid()) 
    AND (
      crew_member_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain', 'purser']::app_role[])
    )
  );

-- RLS Policies for quarantine_bookings
CREATE POLICY "Users can view quarantine bookings in their company" ON public.quarantine_bookings
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Authorized users can manage quarantine bookings" ON public.quarantine_bookings
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid()) 
    AND (
      crew_member_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain', 'purser']::app_role[])
    )
  );

-- RLS Policies for document_naming_rules
CREATE POLICY "Users can view naming rules" ON public.document_naming_rules
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "DPA can manage company naming rules" ON public.document_naming_rules
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid()) 
    AND public.has_role(auth.uid(), 'dpa')
  );

-- Create storage bucket for crew travel documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('crew-travel-documents', 'crew-travel-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload travel documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crew-travel-documents');

CREATE POLICY "Users can view their company travel documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'crew-travel-documents');

CREATE POLICY "Users can update travel documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'crew-travel-documents');

CREATE POLICY "Users can delete travel documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'crew-travel-documents');