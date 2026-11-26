/**
 * Fleet operations access areas (D-X5-21; X5 spec §0.4): the TS side of SQL
 * `fleet_ops_can(company, vessel, area, level)` /
 * `fleet_ops_can_for(user, company, vessel, area, level)` in
 * `20261124040000_fleet_expiry_engine.sql`.
 *
 * The server decides, in order: an inactive caller, another company or an
 * unknown area / level → false; with a vessel, the vessel is of the company
 * and reached (vessel reach or fleet reach); with no vessel (fleet-level
 * data) fleet reach in the company is required; an external viewer passes
 * view only; legacy full access (legacy dpa / shore management, RBAC
 * superadmin / dpa) → true; otherwise the area's rule below.
 *
 * Each area's rule is the useCan adaptor's rule for the capability key the
 * client gates the same data with (`FLEET_OPS_AREA_CAPABILITY`), so the
 * page gate and the server agree (D-04). `src/test/fleet/fleetOpsAccess.test.ts`
 * pins every pair against `ruleForCapability`, the nav role lists against
 * `MODULE_ACCESS` in AuthContext.tsx and the SQL's lists against these.
 *
 * - `rbac` areas: the RBAC module at the level or higher; at view also the
 *   nav check of `canAccessModule(nav)` (RBAC fleet_master, the nav module's
 *   RBAC view, or a legacy profile role of the nav's list).
 * - `domain` areas: `hr` → hr_can_view / _edit / _admin (at view also the
 *   catalogue's legacy flag); `fitness` → med_fitness_can_view (or medical
 *   view) at view, the medical helpers at edit / admin; `medical` →
 *   medical_can_view / _edit / _admin. `medical_admin` is medical admin at
 *   any level.
 */
import type { CapabilityRule } from '@/lib/permissions/adaptor';
import type { CapabilityKey } from '@/lib/permissions/types';

/** Every area `fleet_ops_can` answers for. */
export const FLEET_OPS_AREAS = [
  'dashboard',
  'reports',
  'documents',
  'checklists',
  'training',
  'certificates',
  'crew_documents',
  'insurance',
  'hr',
  'medical_fitness',
  'medical_clinical',
  'medical_admin',
] as const;
export type FleetOpsArea = (typeof FLEET_OPS_AREAS)[number];

export const FLEET_OPS_LEVELS = ['view', 'edit', 'admin'] as const;
export type FleetOpsLevel = (typeof FLEET_OPS_LEVELS)[number];

/** The read areas an expiry source may name (`expiry_sources_read_area_check`). */
export const EXPIRY_READ_AREAS = ['certificates', 'crew_documents', 'insurance', 'hr', 'training', 'medical_fitness'] as const satisfies readonly FleetOpsArea[];
export type ExpiryReadArea = (typeof EXPIRY_READ_AREAS)[number];

const rbac = (module: string, nav: string): CapabilityRule => ({ kind: 'rbac', module, nav });
const domain = (d: 'hr' | 'fitness' | 'medical'): CapabilityRule => ({ kind: 'domain', domain: d });

/** The rule SQL applies per area (the adaptor's rule shape). */
export const FLEET_OPS_AREA_RULES: Readonly<Record<FleetOpsArea, CapabilityRule>> = {
  dashboard: rbac('dashboard', 'dashboard'),
  reports: rbac('reports', 'reports'),
  documents: rbac('documents', 'documents'),
  checklists: rbac('ism', 'ism'),
  training: rbac('training', 'development'),
  certificates: rbac('vessel_certificates', 'certificates'),
  crew_documents: rbac('crew_certificates', 'crew'),
  insurance: rbac('insurance', 'insurance'),
  hr: domain('hr'),
  medical_fitness: domain('fitness'),
  medical_clinical: domain('medical'),
  medical_admin: domain('medical'),
};

/** The capability key the client gates each area's data with (at the area's natural level). */
export const FLEET_OPS_AREA_CAPABILITY: Readonly<Record<FleetOpsArea, CapabilityKey>> = {
  dashboard: 'fleet.operations.fleet_dashboard.view',
  reports: 'fleet.operations.fleet_reports.view',
  documents: 'fleet.operations.fleet_documents.view',
  checklists: 'fleet.operations.fleet_checklists.view',
  training: 'fleet.operations.fleet_training.view',
  certificates: 'vessel.certificates.status_summary.view',
  crew_documents: 'vessel.crew.crew_certificates.view',
  insurance: 'vessel.management.office_insurance.view',
  hr: 'hris.employee_records.contracts_employment.view',
  medical_fitness: 'fleet.operations.fleet_medical.view',
  medical_clinical: 'health.personnel_medical.allergies_conditions.view',
  medical_admin: 'fleet.operations.fleet_medical.admin',
};

/** Catalogue legacy flags SQL also honours at view (the adaptor grants the key on the flag alone). */
export const FLEET_OPS_AREA_LEGACY_FLAGS: Readonly<Partial<Record<FleetOpsArea, string>>> = {
  hr: 'crew.access_employment_records',
};

/**
 * The legacy profile roles the nav check admits at view, per RBAC area
 * (`MODULE_ACCESS[nav]` in AuthContext.tsx, copied into the SQL between the
 * `fleet-ops-nav-rules` markers). Domain areas have no nav check.
 */
export const FLEET_OPS_NAV_ROLES: Readonly<Partial<Record<FleetOpsArea, readonly string[]>>> = {
  dashboard: ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer', 'crew'],
  reports: [],
  documents: ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer', 'crew'],
  checklists: ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer'],
  training: [],
  certificates: ['dpa', 'shore_management', 'master', 'chief_officer'],
  crew_documents: ['dpa', 'shore_management', 'master', 'chief_officer'],
  insurance: [],
};

/** The RBAC module the nav check reads when it differs from the area's module (canAccessModule's moduleKeyMap). */
export const FLEET_OPS_NAV_MODULE: Readonly<Partial<Record<FleetOpsArea, string>>> = {
  crew_documents: 'crew_roster',
};

export function isFleetOpsArea(value: unknown): value is FleetOpsArea {
  return typeof value === 'string' && (FLEET_OPS_AREAS as readonly string[]).includes(value);
}

export function isFleetOpsLevel(value: unknown): value is FleetOpsLevel {
  return typeof value === 'string' && (FLEET_OPS_LEVELS as readonly string[]).includes(value);
}

/** The capability key for an area (its client gate). */
export function fleetOpsCapability(area: FleetOpsArea): CapabilityKey {
  return FLEET_OPS_AREA_CAPABILITY[area];
}
