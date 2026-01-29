
-- ============================================
-- STORM RBAC Part 3: Remaining Roles, Functions & RLS
-- ============================================

-- ============================================
-- PURSER: Vessel scope, admin focus
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'vessel', '{"kpis_only": true}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'view', 'vessel', '{"contracts_rotation_only": true}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'edit', 'vessel', '{"contracts_rotation_only": true}' FROM roles r WHERE r.name = 'purser';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'purser';


-- ============================================
-- CHIEF OFFICER: Vessel scope, safety focus
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'vessel', '{"kpis_only": true}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'view', 'vessel', '{"summary_only": true}' FROM roles r WHERE r.name = 'chief_officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_officer';


-- ============================================
-- CHIEF ENGINEER: Vessel scope, engineering
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'view', 'vessel', '{"summary_only": true}' FROM roles r WHERE r.name = 'chief_engineer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'chief_engineer';


-- ============================================
-- HOD: Department scope
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'edit', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'department', '{}' FROM roles r WHERE r.name = 'hod';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'department', '{"kpis_only": true}' FROM roles r WHERE r.name = 'hod';


-- ============================================
-- OFFICER: Vessel scope, limited edit
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'edit', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'officer';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'vessel', '{"kpis_only": true}' FROM roles r WHERE r.name = 'officer';


-- ============================================
-- CREW: Self scope, very limited
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'self', '{}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'self', '{}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'self', '{}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'vessel', '{"restricted": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'edit', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'edit', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'edit', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'self', '{}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'vessel', '{}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'vessel', '{"report_only": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'edit', 'vessel', '{"report_only": true}' FROM roles r WHERE r.name = 'crew';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'view', 'self', '{"optional": true}' FROM roles r WHERE r.name = 'crew';


-- ============================================
-- AUDITOR: Time-limited, read-only, redacted
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'fleet', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessels', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_certificates', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'vessel_certificates', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'documents', 'view', 'vessel', '{"restricted": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ism', 'view', 'vessel', '{"completed_only": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'erm', 'view', 'vessel', '{"restricted": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'ptw', 'view', 'vessel', '{"completed_only": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'risk_assessments', 'view', 'vessel', '{"completed_only": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'sops', 'view', 'vessel', '{"restricted": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'drills', 'view', 'vessel', '{"completed_only": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'training', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'meetings', 'view', 'vessel', '{"minutes_only": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'incidents', 'view', 'vessel', '{"redacted": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'investigations', 'view', 'vessel', '{"redacted": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'capa', 'view', 'vessel', '{"redacted": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'non_conformities', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'observations', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'audits_surveys', 'view', 'vessel', '{"assigned_scope": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'maintenance', 'view', 'vessel', '{"kpis_only": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'insurance', 'view', 'vessel', '{"certificates_only": true}' FROM roles r WHERE r.name = 'auditor';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'reports', 'view', 'vessel', '{"limited": true}' FROM roles r WHERE r.name = 'auditor';


-- ============================================
-- EMPLOYER API: API only, snapshot data
-- ============================================
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'dashboard', 'view', 'fleet', '{"limited": true}' FROM roles r WHERE r.name = 'employer_api';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'crew_roster', 'view', 'fleet', '{"snapshot_only": true}' FROM roles r WHERE r.name = 'employer_api';
INSERT INTO role_permissions (role_id, module_key, permission, scope, restrictions)
SELECT r.id, 'hr', 'view', 'fleet', '{"snapshot_only": true}' FROM roles r WHERE r.name = 'employer_api';


-- ============================================
-- Permission Check Functions
-- ============================================

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_module_key TEXT,
  p_permission permission_level DEFAULT 'view',
  p_vessel_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_permission BOOLEAN := false;
  v_override_granted BOOLEAN;
BEGIN
  -- Check override first
  SELECT is_granted INTO v_override_granted
  FROM user_permission_overrides
  WHERE user_id = p_user_id
    AND module_key = p_module_key
    AND permission = p_permission
    AND (valid_until IS NULL OR valid_until > NOW());
  
  IF v_override_granted IS NOT NULL THEN
    RETURN v_override_granted;
  END IF;
  
  -- Check role-based permission
  SELECT EXISTS (
    SELECT 1
    FROM rbac_user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
      AND rp.module_key = p_module_key
      AND rp.permission = p_permission
      AND (
        rp.scope = 'fleet'
        OR (rp.scope = 'vessel' AND (p_vessel_id IS NULL OR ur.vessel_id = p_vessel_id OR ur.vessel_id IS NULL))
        OR rp.scope = 'department'
        OR rp.scope = 'self'
      )
  ) INTO v_has_permission;
  
  RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Function to get all permissions for a user
CREATE OR REPLACE FUNCTION get_user_permissions_full(p_user_id UUID)
RETURNS TABLE (
  module_key TEXT,
  module_name TEXT,
  can_view BOOLEAN,
  can_edit BOOLEAN,
  can_admin BOOLEAN,
  scope role_scope_type,
  restrictions JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH user_perms AS (
    SELECT DISTINCT
      rp.module_key,
      rp.permission,
      rp.scope,
      rp.restrictions
    FROM rbac_user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
  )
  SELECT 
    m.key AS module_key,
    m.name AS module_name,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module_key = m.key AND up.permission = 'view') AS can_view,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module_key = m.key AND up.permission = 'edit') AS can_edit,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module_key = m.key AND up.permission = 'admin') AS can_admin,
    (SELECT up.scope FROM user_perms up WHERE up.module_key = m.key LIMIT 1) AS scope,
    (SELECT up.restrictions FROM user_perms up WHERE up.module_key = m.key LIMIT 1) AS restrictions
  FROM modules m
  WHERE m.is_active = true
  ORDER BY m.sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Function to get user's roles with details
CREATE OR REPLACE FUNCTION get_user_roles_full(p_user_id UUID)
RETURNS TABLE (
  role_id UUID,
  role_name TEXT,
  role_display_name TEXT,
  vessel_id UUID,
  vessel_name TEXT,
  department TEXT,
  is_fleet_wide BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id AS role_id,
    r.name AS role_name,
    r.display_name AS role_display_name,
    ur.vessel_id,
    v.name AS vessel_name,
    ur.department,
    (ur.vessel_id IS NULL AND r.default_scope = 'fleet') AS is_fleet_wide
  FROM rbac_user_roles ur
  JOIN roles r ON ur.role_id = r.id
  LEFT JOIN vessels v ON ur.vessel_id = v.id
  WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND (ur.valid_until IS NULL OR ur.valid_until > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all RBAC tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

-- Roles: readable by all authenticated
CREATE POLICY "Roles readable by authenticated" ON roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Roles writable by admin" ON roles
  FOR ALL TO authenticated
  USING (user_has_permission(auth.uid(), 'settings', 'admin'));

-- Modules: readable by all
CREATE POLICY "Modules readable by authenticated" ON modules
  FOR SELECT TO authenticated USING (true);

-- Role permissions: readable by all, writable by admin
CREATE POLICY "Role permissions readable" ON role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Role permissions writable by admin" ON role_permissions
  FOR ALL TO authenticated
  USING (user_has_permission(auth.uid(), 'settings', 'admin'));

-- User roles: users see own, admins see all
CREATE POLICY "RBAC user roles self-readable" ON rbac_user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() 
    OR user_has_permission(auth.uid(), 'settings', 'admin')
    OR user_has_permission(auth.uid(), 'settings', 'view')
  );

CREATE POLICY "RBAC user roles writable by admin" ON rbac_user_roles
  FOR ALL TO authenticated
  USING (user_has_permission(auth.uid(), 'settings', 'admin'));

-- User permission overrides
CREATE POLICY "Overrides readable by admin" ON user_permission_overrides
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() 
    OR user_has_permission(auth.uid(), 'settings', 'admin')
  );

CREATE POLICY "Overrides writable by admin" ON user_permission_overrides
  FOR ALL TO authenticated
  USING (user_has_permission(auth.uid(), 'settings', 'admin'));

-- Audit log: readable by admins only
CREATE POLICY "Audit log readable by admin" ON permission_audit_log
  FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'settings', 'admin'));

CREATE POLICY "Audit log insert allowed" ON permission_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);
