-- Red Room Enhancements: Add missing columns and functions

-- 1. Add missing columns to alerts table
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS snoozed_by UUID REFERENCES auth.users(id);
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS snoozed_at TIMESTAMPTZ;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS acknowledged_notes TEXT;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS assigned_to_role TEXT;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id);
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS assignment_notes TEXT;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS assignment_priority TEXT DEFAULT 'normal';
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS is_direct_assignment BOOLEAN DEFAULT false;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS incident_id UUID;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_to_role ON public.alerts(assigned_to_role);
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_by ON public.alerts(assigned_by);
CREATE INDEX IF NOT EXISTS idx_alerts_is_direct_assignment ON public.alerts(is_direct_assignment);
CREATE INDEX IF NOT EXISTS idx_alerts_snoozed_by ON public.alerts(snoozed_by);
CREATE INDEX IF NOT EXISTS idx_alerts_incident_id ON public.alerts(incident_id);

-- 2. Function to snooze an urgent action (for Red Room items)
CREATE OR REPLACE FUNCTION public.snooze_alert(
  p_alert_id UUID,
  p_snooze_hours INT DEFAULT 4,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_snooze_until TIMESTAMPTZ;
  v_current_count INT;
  v_alert RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_snooze_until := NOW() + (p_snooze_hours || ' hours')::INTERVAL;
  
  -- Get current alert state
  SELECT id, snooze_count INTO v_alert
  FROM alerts WHERE id = p_alert_id;
  
  IF v_alert.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alert not found');
  END IF;
  
  v_current_count := COALESCE(v_alert.snooze_count, 0);

  -- Limit snooze count (max 3 snoozes)
  IF v_current_count >= 3 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Maximum snooze limit reached (3). Please address this alert.'
    );
  END IF;

  -- Update alert
  UPDATE alerts SET
    snoozed_until = v_snooze_until,
    snoozed_by = v_user_id,
    snoozed_at = NOW(),
    snooze_count = v_current_count + 1,
    last_snooze_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_alert_id;

  RETURN jsonb_build_object(
    'success', true, 
    'snoozed_until', v_snooze_until,
    'snooze_count', v_current_count + 1,
    'remaining_snoozes', 3 - (v_current_count + 1)
  );
END;
$$;

-- 3. Function to acknowledge a non-urgent alert
CREATE OR REPLACE FUNCTION public.acknowledge_alert_action(
  p_alert_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_severity TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get alert severity
  SELECT severity_color INTO v_severity FROM alerts WHERE id = p_alert_id;
  
  IF v_severity IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alert not found');
  END IF;

  -- Prevent acknowledge on red/urgent alerts (must use snooze)
  IF LOWER(v_severity) = 'red' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Cannot acknowledge urgent alerts. Use snooze function instead.'
    );
  END IF;

  -- Update alert
  UPDATE alerts SET
    status = 'ACKNOWLEDGED',
    acknowledged_by = v_user_id,
    acknowledged_at = NOW(),
    acknowledged_notes = p_notes,
    updated_at = NOW()
  WHERE id = p_alert_id
  AND status = 'OPEN';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alert not found or already acknowledged');
  END IF;

  RETURN jsonb_build_object('success', true, 'acknowledged_by', v_user_id);
END;
$$;

-- 4. Function to assign a task (DPA and Captains only)
CREATE OR REPLACE FUNCTION public.assign_alert_task(
  p_alert_id UUID,
  p_assign_to_user_id UUID DEFAULT NULL,
  p_assign_to_role TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'urgent'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_assignee_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get user's role from rbac_user_roles
  SELECT r.name INTO v_user_role
  FROM rbac_user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_user_id AND ur.is_active = true
  LIMIT 1;

  -- Check permission: Only DPA, Captain, Fleet Manager can assign
  IF v_user_role IS NULL OR v_user_role NOT IN ('DPA', 'Captain', 'Fleet Manager', 'Master', 'superadmin') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Only DPA and Captains can assign tasks'
    );
  END IF;

  -- Must assign to either user or role
  IF p_assign_to_user_id IS NULL AND p_assign_to_role IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Must specify either a user or a role to assign to'
    );
  END IF;

  -- Get assignee name if assigning to user
  IF p_assign_to_user_id IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, 'Unknown') INTO v_assignee_name
    FROM profiles WHERE user_id = p_assign_to_user_id;
  ELSE
    v_assignee_name := p_assign_to_role;
  END IF;

  -- Check alert exists
  IF NOT EXISTS (SELECT 1 FROM alerts WHERE id = p_alert_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alert not found');
  END IF;

  -- Update alert with assignment
  UPDATE alerts SET
    assigned_to_user_id = p_assign_to_user_id,
    assigned_to_role = p_assign_to_role,
    assigned_by = v_user_id,
    assigned_at = NOW(),
    assignment_notes = p_notes,
    assignment_priority = p_priority,
    is_direct_assignment = true,
    updated_at = NOW()
  WHERE id = p_alert_id;

  RETURN jsonb_build_object(
    'success', true, 
    'assigned_to', v_assignee_name,
    'priority', p_priority
  );
END;
$$;

-- 5. Function to get Red Room items for current user
CREATE OR REPLACE FUNCTION public.get_red_room_items(
  p_company_id UUID,
  p_vessel_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  severity TEXT,
  status TEXT,
  source_module TEXT,
  due_at TIMESTAMPTZ,
  vessel_id UUID,
  vessel_name TEXT,
  incident_id UUID,
  related_entity_type TEXT,
  related_entity_id TEXT,
  is_direct_assignment BOOLEAN,
  assigned_by_name TEXT,
  assigned_at TIMESTAMPTZ,
  assignment_notes TEXT,
  assignment_priority TEXT,
  snooze_count INT,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  is_overdue BOOLEAN,
  is_snoozed BOOLEAN,
  source_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Get user's role
  SELECT r.name INTO v_user_role
  FROM rbac_user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_user_id AND ur.is_active = true
  LIMIT 1;

  RETURN QUERY
  -- Urgent alerts (Red severity, not snoozed)
  SELECT 
    a.id,
    a.title::TEXT,
    a.description::TEXT,
    LOWER(a.severity_color::TEXT) AS severity,
    a.status::TEXT,
    a.source_module::TEXT,
    a.due_at,
    a.vessel_id,
    v.name::TEXT AS vessel_name,
    a.incident_id,
    a.related_entity_type::TEXT,
    a.related_entity_id::TEXT,
    COALESCE(a.is_direct_assignment, false),
    (SELECT COALESCE(p.first_name || ' ' || p.last_name, 'Unknown') FROM profiles p WHERE p.user_id = a.assigned_by) AS assigned_by_name,
    a.assigned_at,
    a.assignment_notes::TEXT,
    a.assignment_priority::TEXT,
    COALESCE(a.snooze_count, 0)::INT,
    a.snoozed_until,
    a.created_at,
    (a.due_at IS NOT NULL AND a.due_at < NOW()) AS is_overdue,
    (a.snoozed_until IS NOT NULL AND a.snoozed_until > NOW()) AS is_snoozed,
    'urgent'::TEXT AS source_type
  FROM alerts a
  LEFT JOIN vessels v ON v.id = a.vessel_id
  WHERE 
    a.company_id = p_company_id
    AND a.status = 'OPEN'
    AND LOWER(a.severity_color::TEXT) = 'red'
    AND (a.snoozed_until IS NULL OR a.snoozed_until <= NOW())
    AND (p_vessel_id IS NULL OR a.vessel_id = p_vessel_id)

  UNION ALL

  -- Tasks directly assigned to current user (ANY severity, not red)
  SELECT 
    a.id,
    a.title::TEXT,
    a.description::TEXT,
    LOWER(a.severity_color::TEXT) AS severity,
    a.status::TEXT,
    a.source_module::TEXT,
    a.due_at,
    a.vessel_id,
    v.name::TEXT AS vessel_name,
    a.incident_id,
    a.related_entity_type::TEXT,
    a.related_entity_id::TEXT,
    COALESCE(a.is_direct_assignment, false),
    (SELECT COALESCE(p.first_name || ' ' || p.last_name, 'Unknown') FROM profiles p WHERE p.user_id = a.assigned_by) AS assigned_by_name,
    a.assigned_at,
    a.assignment_notes::TEXT,
    a.assignment_priority::TEXT,
    COALESCE(a.snooze_count, 0)::INT,
    a.snoozed_until,
    a.created_at,
    (a.due_at IS NOT NULL AND a.due_at < NOW()) AS is_overdue,
    (a.snoozed_until IS NOT NULL AND a.snoozed_until > NOW()) AS is_snoozed,
    'assigned'::TEXT AS source_type
  FROM alerts a
  LEFT JOIN vessels v ON v.id = a.vessel_id
  WHERE 
    a.company_id = p_company_id
    AND a.status = 'OPEN'
    AND COALESCE(a.is_direct_assignment, false) = true
    AND (
      a.assigned_to_user_id = v_user_id
      OR a.assigned_to_role = v_user_role
    )
    AND LOWER(a.severity_color::TEXT) != 'red'
    AND (a.snoozed_until IS NULL OR a.snoozed_until <= NOW())
    AND (p_vessel_id IS NULL OR a.vessel_id = p_vessel_id)

  ORDER BY 
    is_overdue DESC,
    assignment_priority DESC NULLS LAST,
    due_at ASC NULLS LAST,
    created_at DESC
  
  LIMIT 20;
END;
$$;

-- 6. Function to check if user can assign tasks (DPA/Captain)
CREATE OR REPLACE FUNCTION public.can_user_assign_tasks()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT r.name INTO v_user_role
  FROM rbac_user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_user_id AND ur.is_active = true
  LIMIT 1;

  RETURN v_user_role IN ('DPA', 'Captain', 'Fleet Manager', 'Master', 'superadmin');
END;
$$;