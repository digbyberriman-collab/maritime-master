-- Primary emergency contact details per vessel (single source of truth)
CREATE TABLE vessel_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id UUID NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Header & Instructions
  emergency_heading TEXT NOT NULL DEFAULT 'EMERGENCY CONTACT DETAILS 24/7',
  primary_instruction TEXT NOT NULL DEFAULT 'PLEASE DIAL THIS NUMBER FIRST',
  secondary_instruction TEXT DEFAULT 'If you cannot reach us, please dial one of the below emergency team members:',
  
  -- Primary Contact (prominently displayed)
  primary_phone TEXT NOT NULL,
  primary_email TEXT NOT NULL,
  
  -- Branding
  logo_url TEXT,
  
  -- Versioning
  revision_number INT NOT NULL DEFAULT 1,
  revision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  
  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_emergency_vessel_active ON vessel_emergency_contacts(vessel_id) WHERE (is_active = true);
CREATE INDEX idx_emergency_company ON vessel_emergency_contacts(company_id);

-- Emergency team members linked to vessel emergency contacts
CREATE TABLE emergency_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_contact_id UUID NOT NULL REFERENCES vessel_emergency_contacts(id) ON DELETE CASCADE,
  
  -- Contact Details
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  
  -- Display order
  display_order INT NOT NULL DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_team_emergency ON emergency_team_members(emergency_contact_id);
CREATE INDEX idx_team_order ON emergency_team_members(display_order);

-- Version history for audit trail
CREATE TABLE emergency_contacts_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_contact_id UUID NOT NULL REFERENCES vessel_emergency_contacts(id) ON DELETE CASCADE,
  
  -- Snapshot of data at this revision
  revision_number INT NOT NULL,
  revision_date DATE NOT NULL,
  
  -- Full data snapshot
  data_snapshot JSONB NOT NULL,
  
  -- Change details
  change_summary TEXT,
  
  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_history_contact ON emergency_contacts_history(emergency_contact_id);
CREATE INDEX idx_history_revision ON emergency_contacts_history(revision_number);

-- Optional fleet-wide default template
CREATE TABLE fleet_emergency_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Header & Instructions (fleet defaults)
  emergency_heading TEXT NOT NULL DEFAULT 'EMERGENCY CONTACT DETAILS 24/7',
  primary_instruction TEXT NOT NULL DEFAULT 'PLEASE DIAL THIS NUMBER FIRST',
  secondary_instruction TEXT DEFAULT 'If you cannot reach us, please dial one of the below emergency team members:',
  
  -- Primary Contact (fleet default)
  primary_phone TEXT NOT NULL,
  primary_email TEXT NOT NULL,
  
  -- Branding
  logo_url TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT one_default_per_company UNIQUE (company_id)
);

-- Fleet default team members
CREATE TABLE fleet_emergency_team_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_default_id UUID NOT NULL REFERENCES fleet_emergency_defaults(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fleet_team_default ON fleet_emergency_team_defaults(fleet_default_id);

-- Enable RLS
ALTER TABLE vessel_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_emergency_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_emergency_team_defaults ENABLE ROW LEVEL SECURITY;

-- Everyone in company can view emergency contacts (safety-critical)
CREATE POLICY "company_can_view_emergency" ON vessel_emergency_contacts
  FOR SELECT
  USING (
    is_active = true 
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "company_can_view_team" ON emergency_team_members
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM vessel_emergency_contacts vec
      WHERE vec.id = emergency_team_members.emergency_contact_id
      AND public.user_belongs_to_company(auth.uid(), vec.company_id)
    )
  );

-- DPA/Captain/Fleet Manager can edit emergency contacts
CREATE POLICY "dpa_captain_can_insert_emergency" ON vessel_emergency_contacts
  FOR INSERT
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain']::app_role[])
  );

CREATE POLICY "dpa_captain_can_update_emergency" ON vessel_emergency_contacts
  FOR UPDATE
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain']::app_role[])
  );

CREATE POLICY "dpa_captain_can_delete_emergency" ON vessel_emergency_contacts
  FOR DELETE
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain']::app_role[])
  );

-- Team members inherit from parent emergency contact
CREATE POLICY "dpa_captain_can_insert_team" ON emergency_team_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vessel_emergency_contacts vec
      WHERE vec.id = emergency_team_members.emergency_contact_id
      AND public.user_belongs_to_company(auth.uid(), vec.company_id)
      AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain']::app_role[])
    )
  );

CREATE POLICY "dpa_captain_can_update_team" ON emergency_team_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vessel_emergency_contacts vec
      WHERE vec.id = emergency_team_members.emergency_contact_id
      AND public.user_belongs_to_company(auth.uid(), vec.company_id)
      AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain']::app_role[])
    )
  );

CREATE POLICY "dpa_captain_can_delete_team" ON emergency_team_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM vessel_emergency_contacts vec
      WHERE vec.id = emergency_team_members.emergency_contact_id
      AND public.user_belongs_to_company(auth.uid(), vec.company_id)
      AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain']::app_role[])
    )
  );

-- History viewable by DPA/Captain/Fleet Manager
CREATE POLICY "dpa_captain_view_history" ON emergency_contacts_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vessel_emergency_contacts vec
      WHERE vec.id = emergency_contacts_history.emergency_contact_id
      AND public.user_belongs_to_company(auth.uid(), vec.company_id)
    )
    AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain']::app_role[])
  );

CREATE POLICY "dpa_captain_insert_history" ON emergency_contacts_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vessel_emergency_contacts vec
      WHERE vec.id = emergency_contacts_history.emergency_contact_id
      AND public.user_belongs_to_company(auth.uid(), vec.company_id)
    )
    AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'captain']::app_role[])
  );

-- Fleet defaults accessible by company members
CREATE POLICY "company_can_view_fleet_defaults" ON fleet_emergency_defaults
  FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "dpa_can_manage_fleet_defaults" ON fleet_emergency_defaults
  FOR ALL
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master']::app_role[])
  );

CREATE POLICY "company_can_view_fleet_team_defaults" ON fleet_emergency_team_defaults
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fleet_emergency_defaults fed
      WHERE fed.id = fleet_emergency_team_defaults.fleet_default_id
      AND public.user_belongs_to_company(auth.uid(), fed.company_id)
    )
  );

CREATE POLICY "dpa_can_manage_fleet_team_defaults" ON fleet_emergency_team_defaults
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM fleet_emergency_defaults fed
      WHERE fed.id = fleet_emergency_team_defaults.fleet_default_id
      AND public.user_belongs_to_company(auth.uid(), fed.company_id)
      AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master']::app_role[])
    )
  );

-- Function to get emergency contacts with team members
CREATE OR REPLACE FUNCTION get_vessel_emergency_contacts(p_vessel_id UUID)
RETURNS TABLE (
  id UUID,
  vessel_id UUID,
  emergency_heading TEXT,
  primary_instruction TEXT,
  secondary_instruction TEXT,
  primary_phone TEXT,
  primary_email TEXT,
  logo_url TEXT,
  revision_number INT,
  revision_date DATE,
  updated_at TIMESTAMPTZ,
  updated_by_name TEXT,
  team_members JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vec.id,
    vec.vessel_id,
    vec.emergency_heading,
    vec.primary_instruction,
    vec.secondary_instruction,
    vec.primary_phone,
    vec.primary_email,
    vec.logo_url,
    vec.revision_number,
    vec.revision_date,
    vec.updated_at,
    p.first_name || ' ' || p.last_name AS updated_by_name,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', etm.id,
          'name', etm.name,
          'position', etm.position,
          'phone', etm.phone,
          'email', etm.email,
          'display_order', etm.display_order
        ) ORDER BY etm.display_order
      )
      FROM emergency_team_members etm
      WHERE etm.emergency_contact_id = vec.id AND etm.is_active = true),
      '[]'::JSONB
    ) AS team_members
  FROM vessel_emergency_contacts vec
  LEFT JOIN profiles p ON p.user_id = vec.updated_by
  WHERE vec.vessel_id = p_vessel_id
  AND vec.is_active = true;
END;
$$;

-- Function to update emergency contacts with versioning
CREATE OR REPLACE FUNCTION update_emergency_contacts(
  p_vessel_id UUID,
  p_company_id UUID,
  p_emergency_heading TEXT,
  p_primary_instruction TEXT,
  p_secondary_instruction TEXT,
  p_primary_phone TEXT,
  p_primary_email TEXT,
  p_logo_url TEXT,
  p_team_members JSONB,
  p_change_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
  v_old_revision INT;
  v_new_revision INT;
  v_snapshot JSONB;
  v_team_member JSONB;
  v_user_name TEXT;
BEGIN
  -- Get user name
  SELECT first_name || ' ' || last_name INTO v_user_name
  FROM profiles WHERE user_id = auth.uid();

  -- Get existing contact
  SELECT id, revision_number INTO v_contact_id, v_old_revision
  FROM vessel_emergency_contacts
  WHERE vessel_id = p_vessel_id AND is_active = true;
  
  v_new_revision := COALESCE(v_old_revision, 0) + 1;

  IF v_contact_id IS NOT NULL THEN
    -- Create history snapshot before update
    SELECT jsonb_build_object(
      'emergency_heading', vec.emergency_heading,
      'primary_instruction', vec.primary_instruction,
      'secondary_instruction', vec.secondary_instruction,
      'primary_phone', vec.primary_phone,
      'primary_email', vec.primary_email,
      'logo_url', vec.logo_url,
      'team_members', (
        SELECT jsonb_agg(jsonb_build_object(
          'name', etm.name, 'position', etm.position, 
          'phone', etm.phone, 'email', etm.email
        ) ORDER BY etm.display_order)
        FROM emergency_team_members etm
        WHERE etm.emergency_contact_id = vec.id AND etm.is_active = true
      )
    ) INTO v_snapshot
    FROM vessel_emergency_contacts vec
    WHERE vec.id = v_contact_id;

    -- Insert history record
    INSERT INTO emergency_contacts_history (
      emergency_contact_id, revision_number, revision_date,
      data_snapshot, change_summary, created_by, created_by_name
    ) VALUES (
      v_contact_id, v_old_revision, 
      (SELECT revision_date FROM vessel_emergency_contacts WHERE id = v_contact_id),
      v_snapshot, p_change_summary, auth.uid(), v_user_name
    );

    -- Update existing record
    UPDATE vessel_emergency_contacts SET
      emergency_heading = p_emergency_heading,
      primary_instruction = p_primary_instruction,
      secondary_instruction = p_secondary_instruction,
      primary_phone = p_primary_phone,
      primary_email = p_primary_email,
      logo_url = p_logo_url,
      revision_number = v_new_revision,
      revision_date = CURRENT_DATE,
      updated_by = auth.uid(),
      updated_at = NOW()
    WHERE id = v_contact_id;

    -- Deactivate old team members
    UPDATE emergency_team_members SET is_active = false
    WHERE emergency_contact_id = v_contact_id;

  ELSE
    -- Insert new record
    INSERT INTO vessel_emergency_contacts (
      vessel_id, company_id, emergency_heading, primary_instruction, secondary_instruction,
      primary_phone, primary_email, logo_url, revision_number, revision_date,
      created_by, updated_by
    ) VALUES (
      p_vessel_id, p_company_id, p_emergency_heading, p_primary_instruction, p_secondary_instruction,
      p_primary_phone, p_primary_email, p_logo_url, 1, CURRENT_DATE,
      auth.uid(), auth.uid()
    )
    RETURNING id INTO v_contact_id;
  END IF;

  -- Insert new team members
  FOR v_team_member IN SELECT * FROM jsonb_array_elements(p_team_members)
  LOOP
    INSERT INTO emergency_team_members (
      emergency_contact_id, name, position, phone, email, display_order
    ) VALUES (
      v_contact_id,
      v_team_member->>'name',
      v_team_member->>'position',
      v_team_member->>'phone',
      v_team_member->>'email',
      COALESCE((v_team_member->>'display_order')::INT, 0)
    );
  END LOOP;

  RETURN v_contact_id;
END;
$$;

-- Function to initialize vessel emergency contacts from fleet defaults
CREATE OR REPLACE FUNCTION initialize_vessel_emergency_from_defaults(p_vessel_id UUID, p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults RECORD;
  v_contact_id UUID;
BEGIN
  -- Check if vessel already has emergency contacts
  IF EXISTS (SELECT 1 FROM vessel_emergency_contacts WHERE vessel_id = p_vessel_id AND is_active = true) THEN
    RETURN NULL;
  END IF;

  -- Get fleet defaults for this company
  SELECT * INTO v_defaults FROM fleet_emergency_defaults WHERE company_id = p_company_id;
  
  IF v_defaults IS NULL THEN
    RETURN NULL;
  END IF;

  -- Create vessel emergency contacts from defaults
  INSERT INTO vessel_emergency_contacts (
    vessel_id, company_id, emergency_heading, primary_instruction, secondary_instruction,
    primary_phone, primary_email, logo_url, created_by, updated_by
  ) VALUES (
    p_vessel_id, p_company_id, v_defaults.emergency_heading, v_defaults.primary_instruction,
    v_defaults.secondary_instruction, v_defaults.primary_phone, v_defaults.primary_email,
    v_defaults.logo_url, auth.uid(), auth.uid()
  )
  RETURNING id INTO v_contact_id;

  -- Copy team members from defaults
  INSERT INTO emergency_team_members (emergency_contact_id, name, position, phone, email, display_order)
  SELECT v_contact_id, name, position, phone, email, display_order
  FROM fleet_emergency_team_defaults
  WHERE fleet_default_id = v_defaults.id;

  RETURN v_contact_id;
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_vessel_emergency_contacts_updated_at
  BEFORE UPDATE ON vessel_emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_team_members_updated_at
  BEFORE UPDATE ON emergency_team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();