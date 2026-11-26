#!/usr/bin/env node
/**
 * Writes supabase/tests/fixtures/capability-cases.json from the client
 * capability adaptor src/lib/permissions/adaptor.ts (DECISIONS D-04; Phase 3
 * wave 1 platform prep PP1). The SQL test
 * supabase/tests/sql/p2_capabilities/crew_keys.test.sql seeds every persona
 * below and asserts that has_capability_for() / has_capability() give
 * `resolveCapability(key, snapshot).allowed` for every crew key the server
 * answers (X1 spec §5), on the persona's own vessel and at company level.
 *
 *   node scripts/db/gen-capability-cases.mjs           # (re)write the fixture
 *   node scripts/db/gen-capability-cases.mjs --check   # exit 1 when it is out of date
 *
 * A persona is the access state the client reads (useAccessSnapshot):
 *   legacyRole    profiles.role
 *   roles         RBAC role names (rbac_user_roles, company-wide). The SQL
 *                 test also writes a company user_roles row for every role
 *                 that is an app_role, because the SQL domain helpers
 *                 (hr_can_*, medical_can_*) read user_roles where the TS
 *                 resolvers read the RBAC role names
 *   permissions   module permission rows (granted overrides in the SQL test;
 *                 the RBAC roles' own role_permissions are removed there, so
 *                 the rows are exactly these)
 *   disciplines   active practitioner disciplines (hw_practitioners)
 * canAccessModule() lives in AuthContext.tsx (React); its tables are read
 * from that file's source (MODULE_ACCESS, moduleKeyMap) and the rule is
 * re-stated here, guarded by an exact match on its full-access line.
 *
 * The fixture also lists the crew keys (cross-checked against
 * CREW_CAPABILITY_KEYS in supabase/functions/_shared/capability.ts) and
 * every catalogue key, so the SQL test can check that the server answers
 * no other key. Never edit the fixture by hand.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { REPO_ROOT, loadTs, seededRandom, sha256File, writeFixture } from './lib/load-ts.mjs';

const OUT = join(REPO_ROOT, 'supabase/tests/fixtures/capability-cases.json');
const SOURCES = [
  'src/lib/permissions/adaptor.ts',
  'src/lib/permissions/catalogue.ts',
  'src/lib/permissions/types.ts',
  'src/modules/auth/lib/hrAccess.ts',
  'src/modules/auth/lib/payrollAccess.ts',
  'src/modules/auth/lib/legalAccess.ts',
  'src/modules/auth/lib/medicalAccess.ts',
  'src/modules/auth/lib/wellnessAccess.ts',
];
const AUTH_CONTEXT = 'src/modules/auth/contexts/AuthContext.tsx';
const EDGE_CAPABILITY = 'supabase/functions/_shared/capability.ts';

/** The crew keys has_capability_for answers (X1 spec §5 without fitness_to_work.view, which only the dropped X1-12 used). */
export const CREW_KEYS = [
  'vessel.crew.crew_list.view',
  'vessel.crew.crew_list.export',
  'vessel.crew.crew_profiles.view',
  'vessel.crew.crew_profiles.view_own',
  'vessel.crew.crew_profiles.create',
  'vessel.crew.crew_profiles.edit',
  'vessel.crew.crew_certificates.view',
  'vessel.crew.crew_certificates.view_own',
  'vessel.crew.crew_certificates.create',
  'vessel.crew.crew_certificates.edit',
  'vessel.crew.crew_certificates.approve',
  'vessel.crew.expiry_alerts.edit',
  'vessel.crew.crew_compliance.view',
  'vessel.crew.crew_compliance.admin',
  'vessel.crew.crew_assignments.view',
  'vessel.crew.crew_assignments.assign',
  'vessel.crew.crew_assignments.approve',
  'vessel.crew.crew_scheduling.view',
  'vessel.crew.crew_scheduling.edit',
  'vessel.crew.hours_of_rest.view_own',
  'vessel.crew.hours_of_rest.view',
  'vessel.crew.hours_of_rest.create',
  'vessel.crew.hours_of_rest.edit',
  'vessel.crew.hours_of_rest.approve',
  'vessel.crew.hours_of_rest.final_approve',
  'vessel.crew.hours_of_rest.export',
  'vessel.crew.familiarisation.view_own',
  'vessel.crew.familiarisation.view',
  'vessel.crew.familiarisation.create',
  'vessel.crew.familiarisation.edit',
  'vessel.crew.familiarisation.sign',
  'vessel.crew.familiarisation.approve',
  'hris.leave_rotation.leave_requests.approve',
  'hris.employee_records.contracts_employment.view',
  'hris.employee_records.contracts_employment.edit',
  'health.personnel_medical.crew_medical_records.view',
];

/** The admin keys of 20261123000400 (p2_capabilities/capabilities.test.sql owns their matrix). */
const ADMIN_KEYS = [
  'admin.access.users_access.view',
  'admin.access.users_access.assign',
  'admin.access.users_access.admin',
  'admin.access.roles_permissions.admin',
  'admin.access.permission_audit_log.view',
  'fleet.operations.vessels.view',
  'fleet.operations.vessels.admin',
];

/** RBAC role names that are also app_role values (the SQL test writes user_roles rows for them). */
const APP_ROLES = ['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'chief_officer', 'chief_engineer', 'hod', 'officer', 'crew'];
const LEGACY_ROLES = ['dpa', 'shore_management', 'master', 'chief_officer', 'chief_engineer', 'crew'];
const LEVELS = ['view', 'edit', 'admin'];

// ---------------------------------------------------------------- the sources

const { modules, sourceSha256 } = await loadTs(SOURCES);
const { resolveCapability } = modules['src/lib/permissions/adaptor.ts'];
const { listCatalogueCapabilities } = modules['src/lib/permissions/catalogue.ts'];
sourceSha256[AUTH_CONTEXT] = sha256File(join(REPO_ROOT, AUTH_CONTEXT));
sourceSha256[EDGE_CAPABILITY] = sha256File(join(REPO_ROOT, EDGE_CAPABILITY));

/** The object literal (string -> string or string[]) bound to `name` in a source file. */
function objectLiteral(file, name) {
  const source = readFileSync(join(REPO_ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let found = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      found = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error(`gen-capability-cases: ${name} not found in ${file}`);
  const value = (n) => {
    if (ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n)) return value(n.expression);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isArrayLiteralExpression(n)) return n.elements.map(value);
    if (ts.isObjectLiteralExpression(n)) {
      const out = {};
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p)) throw new Error(`gen-capability-cases: ${name}: unsupported property`);
        const key = ts.isStringLiteral(p.name) || ts.isIdentifier(p.name) ? p.name.text : null;
        if (key === null) throw new Error(`gen-capability-cases: ${name}: unsupported key`);
        out[key] = value(p.initializer);
      }
      return out;
    }
    if (ts.isNewExpression(n) && n.arguments?.length === 1) return value(n.arguments[0]);
    throw new Error(`gen-capability-cases: ${name}: unsupported initializer ${ts.SyntaxKind[n.kind]}`);
  };
  return value(found);
}

const authSource = readFileSync(join(REPO_ROOT, AUTH_CONTEXT), 'utf8');
const FULL_ACCESS_LINE = "if (hasRBACRole('superadmin') || hasRBACRole('dpa') || hasRBACRole('fleet_master')) {";
if (!authSource.includes(FULL_ACCESS_LINE)) {
  throw new Error(`gen-capability-cases: ${AUTH_CONTEXT} no longer has the canAccessModule full-access line; update this generator and the SQL mirror`);
}
const MODULE_ACCESS = objectLiteral(AUTH_CONTEXT, 'MODULE_ACCESS');
const MODULE_KEY_MAP = objectLiteral(AUTH_CONTEXT, 'moduleKeyMap');
const SENSITIVE_MODULES = objectLiteral(AUTH_CONTEXT, 'SENSITIVE_MODULES');
const HEALTH_MODULE = objectLiteral(AUTH_CONTEXT, 'HEALTH_MODULE');

// The edge list must be the generator's list (one key set for SQL, edge and fixture).
const edgeKeys = objectLiteral(EDGE_CAPABILITY, 'CREW_CAPABILITY_KEYS');
if (JSON.stringify(edgeKeys) !== JSON.stringify(CREW_KEYS)) {
  throw new Error(`gen-capability-cases: CREW_CAPABILITY_KEYS in ${EDGE_CAPABILITY} differs from this generator's CREW_KEYS`);
}
const catalogueKeys = listCatalogueCapabilities();
for (const key of CREW_KEYS) {
  if (!catalogueKeys.includes(key)) throw new Error(`gen-capability-cases: ${key} is not a catalogue key`);
}

// ---------------------------------------------------------------- the snapshot

const permissionRow = ({ module, level }) => ({
  module_key: module,
  module_name: module,
  can_view: true,
  can_edit: level === 'edit' || level === 'admin',
  can_admin: level === 'admin',
  scope: 'vessel',
  restrictions: {},
});

/** AuthContext.canAccessModule for the snapshot's state (non-sensitive, non-health modules only). */
function canAccessModuleFor(persona) {
  const roles = persona.roles.map((r) => r.toLowerCase());
  const perms = persona.permissions;
  return (moduleId) => {
    if (SENSITIVE_MODULES.includes(moduleId) || moduleId === HEALTH_MODULE) {
      throw new Error(`gen-capability-cases: canAccessModule('${moduleId}') is resolved by dedicated rules; extend the generator`);
    }
    if (['superadmin', 'dpa', 'fleet_master'].some((r) => roles.includes(r))) return true;
    const rbacKey = MODULE_KEY_MAP[moduleId] || moduleId;
    if (perms.some((p) => p.module === rbacKey)) return true;
    if (!persona.legacyRole) return false;
    const allowed = MODULE_ACCESS[moduleId];
    if (!allowed) return false;
    return allowed.includes(persona.legacyRole);
  };
}

function snapshotFor(persona) {
  return {
    authLoading: false,
    signedIn: true,
    profileId: `profile:${persona.key}`,
    legacyRole: persona.legacyRole,
    rbacInitialized: true,
    rbacLoading: false,
    rbacRoles: persona.roles,
    permissions: persona.permissions.map(permissionRow),
    practitionerDisciplines: persona.disciplines,
    practitionerDisciplinesLoaded: true,
    canAccessModule: canAccessModuleFor(persona),
  };
}

// ---------------------------------------------------------------- the personas

const personas = [];
const keys = new Set();
const persona = (name, { legacyRole = 'crew', roles = [], permissions = [], disciplines = [] } = {}) => {
  const key = `A.cap_${name}`;
  if (keys.has(key)) throw new Error(`gen-capability-cases: persona ${key} twice`);
  keys.add(key);
  for (const r of roles) if (!APP_ROLES.includes(r)) throw new Error(`gen-capability-cases: ${key}: role ${r} is not an app_role`);
  const uniq = new Map(permissions.map((p) => [`${p.module}:${p.level}`, p]));
  personas.push({
    key,
    legacyRole,
    roles: [...new Set(roles)].sort(),
    permissions: [...uniq.values()].sort((a, b) => `${a.module}:${a.level}`.localeCompare(`${b.module}:${b.level}`)),
    disciplines: [...new Set(disciplines)].sort(),
  });
};
const p = (module, level = 'view') => ({ module, level });

// Each legacy profile role on its own.
for (const role of LEGACY_ROLES) persona(`legacy_${role}`, { legacyRole: role });
// Each RBAC role (and its user_roles twin) on a crew profile.
for (const role of APP_ROLES) persona(`rbac_${role}`, { roles: [role] });
// Each module the rules read, at each level.
for (const module of ['crew_roster', 'crew_certificates', 'training', 'hr', 'medical', 'documents']) {
  for (const level of LEVELS) persona(`perm_${module}_${level}`, { permissions: [p(module, level)] });
}
// Each catalogue legacy flag the crew keys read.
for (const flag of [
  'crew.see_crew_list',
  'crew.view_crew_profiles',
  'crew.edit_crew_profiles',
  'crew.view_scheduling',
  'crew.approve_hours_of_rest',
  'crew.approve_leave',
  'crew.access_employment_records',
  'crew.view_medical',
]) {
  persona(`flag_${flag.replace(/\./g, '_')}`, { permissions: [p(flag)] });
}
// Practitioners.
persona('medic', { disciplines: ['medical'] });
persona('spa_practitioner', { disciplines: ['spa'] });
// Combinations the rules distinguish.
persona('master_approves_hor', { legacyRole: 'master', permissions: [p('crew.approve_hours_of_rest')] });
persona('chief_officer_certs_edit', { legacyRole: 'chief_officer', permissions: [p('crew_certificates', 'edit')] });
persona('captain_training_admin', { roles: ['captain'], permissions: [p('training', 'admin')] });
persona('hod_leave_flag', { roles: ['hod'], permissions: [p('crew.approve_leave')] });
persona('engineer_roster_view', { legacyRole: 'chief_engineer', permissions: [p('crew_roster', 'view')] });
persona('purser_employment', { roles: ['purser'], permissions: [p('crew.access_employment_records')] });
persona('medic_flag', { disciplines: ['medical'], permissions: [p('crew.view_medical')] });
persona('nothing', {});
// Seeded random combinations.
const rnd = seededRandom(404);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const RANDOM_MODULES = ['crew_roster', 'crew_certificates', 'training', 'hr', 'medical', 'crew.see_crew_list', 'crew.view_crew_profiles',
  'crew.edit_crew_profiles', 'crew.view_scheduling', 'crew.approve_hours_of_rest', 'crew.approve_leave', 'crew.access_employment_records', 'crew.view_medical'];
for (let i = 0; i < 24; i += 1) {
  const roles = APP_ROLES.filter(() => rnd() < 0.12);
  const permissions = RANDOM_MODULES.filter(() => rnd() < 0.18).map((m) => p(m, m.startsWith('crew.') ? 'view' : pick(LEVELS)));
  const disciplines = rnd() < 0.15 ? ['medical'] : [];
  persona(`random_${String(i).padStart(2, '0')}`, { legacyRole: pick(LEGACY_ROLES), roles, permissions, disciplines });
}

// ---------------------------------------------------------------- the cases

const granted = {};
for (const per of personas) {
  const snap = snapshotFor(per);
  granted[per.key] = CREW_KEYS.filter((key) => {
    const d = resolveCapability(key, snap, {});
    if (d.status === 'loading' || d.status === 'unknown' || d.status === 'signed_out') {
      throw new Error(`gen-capability-cases: ${per.key} ${key} resolved ${d.status} (${d.reason})`);
    }
    return d.allowed;
  });
}
const total = personas.length * CREW_KEYS.length;
const allowed = Object.values(granted).reduce((n, list) => n + list.length, 0);

writeFixture(
  OUT,
  {
    version: 1,
    generator: 'scripts/db/gen-capability-cases.mjs',
    sourceSha256,
    description:
      'has_capability_for() parity cases for the crew keys, generated from the client adaptor src/lib/permissions/adaptor.ts (D-04; Phase 3 wave 1 PP1). Each persona is seeded in company A with a current assignment on A.dra: legacyRole as profiles.role, roles as company-wide rbac_user_roles rows plus user_roles rows of company A, permissions as granted user_permission_overrides (the RBAC roles\' role_permissions are removed in the test), disciplines as hw_practitioners rows. For every persona and crew key, has_capability_for(persona, key, A, A.dra) and at company level (no vessel) must be true exactly when the key is in granted[persona]. canAccessModule tables are read from AuthContext.tsx. Regenerate with node scripts/db/gen-capability-cases.mjs; never edit by hand.',
    crewKeys: CREW_KEYS,
    adminKeys: ADMIN_KEYS,
    catalogueKeys,
    canAccessModule: { moduleAccess: MODULE_ACCESS, moduleKeyMap: MODULE_KEY_MAP },
    personas,
    granted,
    counts: { personas: personas.length, crewKeys: CREW_KEYS.length, cases: total, allowed },
  },
  { compactDepth: 2 },
);
