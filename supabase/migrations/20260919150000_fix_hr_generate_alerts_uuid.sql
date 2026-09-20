-- =================================================================
-- FIX: hr_generate_alerts compared a uuid column against text
-- =================================================================
-- `alerts.related_entity_id` is uuid, but hr_generate_alerts cast the
-- record id to text on every comparison and on the insert. Postgres has no
-- uuid = text operator, so the function raised
--   operator does not exist: uuid = text
-- on its first loop iteration and no HR alert was ever raised: no contract
-- expiry, no probation end, no passport, visa or medical expiry, no review
-- or objective due date.
--
-- Found while building the Health & Wellness alert generator, which copied
-- the same pattern. Both are corrected: the casts are simply removed, since
-- both sides are already uuid.
--
-- This replaces the function body only. No data changes, and the next run
-- of the daily sweeper raises the backlog of alerts that should already
-- have existed.
-- =================================================================

CREATE OR REPLACE FUNCTION public.hr_generate_alerts(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item RECORD;
  v_count integer := 0;
  v_severity public.alert_severity;
  v_alert_type text;
  v_title text;
  v_existing uuid;
BEGIN
  -- "Refresh alerts now" in Right to Work runs this with the user's session:
  -- HR editors only, and only for their own company. Cron / the service
  -- role (no auth.uid()) sweep every company.
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.hr_can_edit(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
    p_company_id := public.get_user_company_id(auth.uid());
    IF p_company_id IS NULL THEN RETURN 0; END IF;
  END IF;
  FOR item IN
    SELECT e.item_type, e.record_id, e.company_id, e.profile_id, e.user_id, e.crew_name, e.vessel_id, e.label, e.due_date, e.days_remaining
    FROM public.hr_expiry_items e
    WHERE (p_company_id IS NULL OR e.company_id = p_company_id) AND e.days_remaining <= 90
    UNION ALL
    SELECT d.item_type, d.record_id, d.company_id, d.profile_id, d.user_id, d.crew_name, d.vessel_id, d.label, d.due_date, d.days_remaining
    FROM public.hr_performance_due_items d
    WHERE (p_company_id IS NULL OR d.company_id = p_company_id) AND d.days_remaining <= 14
  LOOP
    v_severity := CASE WHEN item.days_remaining < 0 THEN 'RED' WHEN item.days_remaining <= 30 THEN 'ORANGE' ELSE 'YELLOW' END;
    v_alert_type := 'hr_' || item.item_type;
    v_title := CASE
      WHEN item.days_remaining < 0 THEN item.crew_name || ': ' || item.label || ' overdue by ' || ABS(item.days_remaining) || ' days'
      ELSE item.crew_name || ': ' || item.label || ' due in ' || item.days_remaining || ' days' END;

    SELECT id INTO v_existing FROM public.alerts
    WHERE company_id = item.company_id AND alert_type = v_alert_type AND related_entity_id = item.record_id
      AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.alerts SET title = v_title, severity_color = v_severity, due_at = item.due_date::timestamptz,
        metadata = jsonb_build_object('item_type', item.item_type, 'profile_id', item.profile_id, 'days_remaining', item.days_remaining),
        updated_at = now()
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.alerts (company_id, vessel_id, alert_type, title, description, severity_color, status, source_module,
        related_entity_type, related_entity_id, due_at, owner_role, metadata)
      VALUES (item.company_id, item.vessel_id, v_alert_type, v_title,
        'HR item for ' || item.crew_name || ' (' || item.label || ') due ' || to_char(item.due_date, 'DD Mon YYYY'),
        v_severity, 'OPEN', 'hris', item.item_type, item.record_id, item.due_date::timestamptz, 'DPA',
        jsonb_build_object('item_type', item.item_type, 'profile_id', item.profile_id, 'days_remaining', item.days_remaining));
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Auto-resolve HR alerts whose item is no longer due (renewed / completed).
  UPDATE public.alerts a SET status = 'AUTO_DISMISSED', resolved_at = now(), updated_at = now()
  WHERE a.source_module = 'hris' AND a.status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    AND (p_company_id IS NULL OR a.company_id = p_company_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.hr_expiry_items e WHERE e.record_id = a.related_entity_id AND e.days_remaining <= 90
      UNION ALL
      SELECT 1 FROM public.hr_performance_due_items d WHERE d.record_id = a.related_entity_id AND d.days_remaining <= 14
    );

  RETURN v_count;
END;
$$;


-- The original definition left the function executable by PUBLIC. It carries a
-- caller guard, but an unauthenticated role has no business reaching a
-- SECURITY DEFINER sweeper at all.
REVOKE ALL ON FUNCTION public.hr_generate_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_generate_alerts(uuid) TO authenticated, service_role;
