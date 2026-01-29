
-- ============================================
-- STORM RBAC Part 2: Default Permission Presets
-- DPA, Fleet Master, Captain roles
-- ============================================

-- ============================================
-- DPA: Full access, fleet scope
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'fleet', '{"restricted": true}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'edit', 'fleet', '{"restricted": true}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'settings', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'settings', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'settings', 'admin', 'fleet', '{}'
FROM roles r WHERE r.name = 'dpa';


-- ============================================
-- FLEET MASTER: Fleet scope, most modules
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'view', 'fleet', '{"restricted": true}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'edit', 'fleet', '{"restricted": true}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'edit', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'settings', 'view', 'fleet', '{}'
FROM roles r WHERE r.name = 'fleet_master';


-- ============================================
-- CAPTAIN: Vessel scope
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'edit', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'vessel', '{"kpis_only": true}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'view', 'vessel', '{"exclude_salaries": true}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'edit', 'vessel', '{"exclude_salaries": true}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'view', 'vessel', '{}'
FROM roles r WHERE r.name = 'captain';

INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'settings', 'view', 'vessel', '{"audit_mode_only": true}'
FROM roles r WHERE r.name = 'captain';
