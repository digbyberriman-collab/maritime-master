-- Vessel dashboard summary function
-- Returns aggregated data per vessel for dashboard display

CREATE OR REPLACE FUNCTION get_vessel_dashboard_summary(
  p_company_id UUID,
  p_vessel_ids UUID[] DEFAULT NULL,
  p_aggregate_all BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  vessel_id UUID,
  vessel_name TEXT,
  imo_number TEXT,
  flag_state TEXT,
  classification_society TEXT,
  open_alerts_count BIGINT,
  red_alerts_count BIGINT,
  crew_onboard_count BIGINT,
  current_captain TEXT,
  certs_expiring_90d BIGINT,
  crew_certs_expiring_90d BIGINT,
  overdue_drills_count BIGINT,
  training_gaps_count BIGINT,
  overdue_maintenance_count BIGINT,
  critical_defects_count BIGINT,
  audits_due_90d BIGINT,
  open_ncs_count BIGINT,
  open_capas_count BIGINT,
  pending_signatures_count BIGINT,
  data_refreshed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_aggregate_all THEN
    -- Return aggregated totals across all/filtered vessels
    RETURN QUERY
    SELECT 
      NULL::UUID AS vessel_id,
      'All Vessels'::TEXT AS vessel_name,
      NULL::TEXT AS imo_number,
      NULL::TEXT AS flag_state,
      NULL::TEXT AS classification_society,
      COALESCE((SELECT COUNT(*) FROM alerts a 
        WHERE a.company_id = p_company_id 
        AND a.status = 'open'
        AND (p_vessel_ids IS NULL OR a.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM alerts a 
        WHERE a.company_id = p_company_id 
        AND a.status = 'open' 
        AND a.severity_color = 'red'
        AND (p_vessel_ids IS NULL OR a.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(DISTINCT ca.user_id) FROM crew_assignments ca
        WHERE ca.is_current = true
        AND (p_vessel_ids IS NULL OR ca.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      NULL::TEXT AS current_captain,
      COALESCE((SELECT COUNT(*) FROM certificates c 
        WHERE c.company_id = p_company_id 
        AND c.certificate_type = 'vessel'
        AND c.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        AND (p_vessel_ids IS NULL OR c.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM crew_certificates cc
        JOIN crew_assignments ca ON ca.user_id = cc.user_id AND ca.is_current = true
        WHERE cc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        AND (p_vessel_ids IS NULL OR ca.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM drills d 
        WHERE d.company_id = p_company_id 
        AND d.status = 'overdue'
        AND (p_vessel_ids IS NULL OR d.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM training_records tr
        JOIN crew_assignments ca ON ca.user_id = tr.user_id AND ca.is_current = true
        WHERE tr.status = 'overdue'
        AND (p_vessel_ids IS NULL OR ca.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM maintenance_tasks mt 
        WHERE mt.company_id = p_company_id 
        AND mt.status = 'overdue'
        AND (p_vessel_ids IS NULL OR mt.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM defects df 
        WHERE df.company_id = p_company_id 
        AND df.severity = 'critical' 
        AND df.status = 'open'
        AND (p_vessel_ids IS NULL OR df.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM audits au 
        WHERE au.company_id = p_company_id 
        AND au.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        AND (p_vessel_ids IS NULL OR au.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM audit_findings af
        JOIN audits au ON au.id = af.audit_id
        WHERE au.company_id = p_company_id 
        AND af.status = 'open'
        AND (p_vessel_ids IS NULL OR au.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM corrective_actions ca2 
        WHERE ca2.company_id = p_company_id 
        AND ca2.status IN ('open', 'in_progress')
        AND (p_vessel_ids IS NULL OR ca2.incident_id IN (
          SELECT i.id FROM incidents i WHERE i.vessel_id = ANY(p_vessel_ids)
        ))), 0)::BIGINT,
      COALESCE((SELECT COUNT(*) FROM form_submissions fs 
        WHERE fs.company_id = p_company_id 
        AND fs.status = 'pending_signatures'
        AND (p_vessel_ids IS NULL OR fs.vessel_id = ANY(p_vessel_ids))), 0)::BIGINT,
      NOW()::TIMESTAMPTZ;
  ELSE
    -- Return per-vessel data
    RETURN QUERY
    SELECT 
      v.id AS vessel_id,
      v.name::TEXT AS vessel_name,
      v.imo_number::TEXT,
      v.flag_state::TEXT,
      v.classification_society::TEXT,
      COALESCE((SELECT COUNT(*) FROM alerts a WHERE a.vessel_id = v.id AND a.status = 'open'), 0)::BIGINT AS open_alerts_count,
      COALESCE((SELECT COUNT(*) FROM alerts a WHERE a.vessel_id = v.id AND a.status = 'open' AND a.severity_color = 'red'), 0)::BIGINT AS red_alerts_count,
      COALESCE((SELECT COUNT(DISTINCT ca.user_id) FROM crew_assignments ca WHERE ca.vessel_id = v.id AND ca.is_current = true), 0)::BIGINT AS crew_onboard_count,
      (SELECT CONCAT(p.first_name, ' ', p.last_name) FROM profiles p 
       JOIN crew_assignments ca ON ca.user_id = p.user_id 
       WHERE ca.vessel_id = v.id AND ca.is_current = true AND ca.position = 'Master' LIMIT 1)::TEXT AS current_captain,
      COALESCE((SELECT COUNT(*) FROM certificates c WHERE c.vessel_id = v.id AND c.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'), 0)::BIGINT AS certs_expiring_90d,
      COALESCE((SELECT COUNT(*) FROM crew_certificates cc
        JOIN crew_assignments ca ON ca.user_id = cc.user_id AND ca.is_current = true
        WHERE ca.vessel_id = v.id AND cc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'), 0)::BIGINT AS crew_certs_expiring_90d,
      COALESCE((SELECT COUNT(*) FROM drills d WHERE d.vessel_id = v.id AND d.status = 'overdue'), 0)::BIGINT AS overdue_drills_count,
      COALESCE((SELECT COUNT(*) FROM training_records tr
        JOIN crew_assignments ca ON ca.user_id = tr.user_id AND ca.is_current = true
        WHERE ca.vessel_id = v.id AND tr.status = 'overdue'), 0)::BIGINT AS training_gaps_count,
      COALESCE((SELECT COUNT(*) FROM maintenance_tasks mt WHERE mt.vessel_id = v.id AND mt.status = 'overdue'), 0)::BIGINT AS overdue_maintenance_count,
      COALESCE((SELECT COUNT(*) FROM defects df WHERE df.vessel_id = v.id AND df.severity = 'critical' AND df.status = 'open'), 0)::BIGINT AS critical_defects_count,
      COALESCE((SELECT COUNT(*) FROM audits au WHERE au.vessel_id = v.id AND au.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'), 0)::BIGINT AS audits_due_90d,
      COALESCE((SELECT COUNT(*) FROM audit_findings af JOIN audits au ON au.id = af.audit_id WHERE au.vessel_id = v.id AND af.status = 'open'), 0)::BIGINT AS open_ncs_count,
      COALESCE((SELECT COUNT(*) FROM corrective_actions ca2 WHERE ca2.incident_id IN (SELECT i.id FROM incidents i WHERE i.vessel_id = v.id) AND ca2.status IN ('open', 'in_progress')), 0)::BIGINT AS open_capas_count,
      COALESCE((SELECT COUNT(*) FROM form_submissions fs WHERE fs.vessel_id = v.id AND fs.status = 'pending_signatures'), 0)::BIGINT AS pending_signatures_count,
      NOW()::TIMESTAMPTZ AS data_refreshed_at
    FROM vessels v
    WHERE v.company_id = p_company_id
      AND v.status != 'Sold'
      AND (p_vessel_ids IS NULL OR v.id = ANY(p_vessel_ids))
    ORDER BY v.name;
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_vessel_dashboard_summary TO authenticated;