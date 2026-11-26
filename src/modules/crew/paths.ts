/**
 * Route paths for the Crew module. Vessel paths are relative to
 * `/v/:vesselCode` (link them with useScopedPath()), fleet paths relative
 * to `/fleet`. Kept apart from routes.tsx so pages can import them without
 * the route table, and so the manifest, the router and the nav cannot drift.
 * The capability keys live here too, for the same reason.
 */
import type { CapabilityKey } from '@/lib/permissions/types';

/** The vessel Crew tab's root, and the base its nav leaves are built on. */
export const CREW_ROOT = 'crew';

/** The personal area's root (the same `/me` as src/config/personalNav.ts PERSONAL_BASE). */
export const PERSONAL_ROOT = '/me';

/** Vessel crew pages, relative to `/v/:vesselCode`. */
export const CREW_PATHS = {
  list: `${CREW_ROOT}/list`,
  roster: `${CREW_ROOT}/roster`,
  compliance: `${CREW_ROOT}/compliance`,
  complianceStatus: `${CREW_ROOT}/compliance/status`,
  hoursOfRest: `${CREW_ROOT}/hours-of-rest`,
  personHoursOfRest: `${CREW_ROOT}/people/:crewId/hours-of-rest`,
  planner: `${CREW_ROOT}/planner`,
  plannerTimeline: `${CREW_ROOT}/planner/timeline`,
  plannerManning: `${CREW_ROOT}/planner/manning`,
  plannerRequests: `${CREW_ROOT}/planner/requests`,
  familiarisation: `${CREW_ROOT}/familiarisation`,
} as const;

/** Fleet crew pages, relative to `/fleet`. */
export const CREW_FLEET_PATHS = {
  planner: 'planner',
} as const;

/**
 * The PMS capability keys of the crew pages and actions (X1 spec §5; the
 * server answers each through has_capability_for, platform prep PP1). The
 * crew medical page and its key belong to fleet operations (X5).
 */
export const CREW_CAPS = {
  crewListView: 'vessel.crew.crew_list.view',
  crewListExport: 'vessel.crew.crew_list.export',
  profilesView: 'vessel.crew.crew_profiles.view',
  profilesViewOwn: 'vessel.crew.crew_profiles.view_own',
  profilesCreate: 'vessel.crew.crew_profiles.create',
  profilesEdit: 'vessel.crew.crew_profiles.edit',
  documentsView: 'vessel.crew.crew_certificates.view',
  documentsViewOwn: 'vessel.crew.crew_certificates.view_own',
  documentsCreate: 'vessel.crew.crew_certificates.create',
  documentsEdit: 'vessel.crew.crew_certificates.edit',
  documentsApprove: 'vessel.crew.crew_certificates.approve',
  expiryAlertsEdit: 'vessel.crew.expiry_alerts.edit',
  complianceView: 'vessel.crew.crew_compliance.view',
  complianceAdmin: 'vessel.crew.crew_compliance.admin',
  assignmentsView: 'vessel.crew.crew_assignments.view',
  assignmentsAssign: 'vessel.crew.crew_assignments.assign',
  assignmentsApprove: 'vessel.crew.crew_assignments.approve',
  schedulingView: 'vessel.crew.crew_scheduling.view',
  schedulingEdit: 'vessel.crew.crew_scheduling.edit',
  horViewOwn: 'vessel.crew.hours_of_rest.view_own',
  horView: 'vessel.crew.hours_of_rest.view',
  horCreate: 'vessel.crew.hours_of_rest.create',
  horEdit: 'vessel.crew.hours_of_rest.edit',
  horApprove: 'vessel.crew.hours_of_rest.approve',
  horFinalApprove: 'vessel.crew.hours_of_rest.final_approve',
  horExport: 'vessel.crew.hours_of_rest.export',
  famViewOwn: 'vessel.crew.familiarisation.view_own',
  famView: 'vessel.crew.familiarisation.view',
  famCreate: 'vessel.crew.familiarisation.create',
  famEdit: 'vessel.crew.familiarisation.edit',
  famSign: 'vessel.crew.familiarisation.sign',
  famApprove: 'vessel.crew.familiarisation.approve',
  leaveApprove: 'hris.leave_rotation.leave_requests.approve',
  employmentView: 'hris.employee_records.contracts_employment.view',
  employmentEdit: 'hris.employee_records.contracts_employment.edit',
  medicalRecordsView: 'health.personnel_medical.crew_medical_records.view',
  appraisalsView: 'hris.performance.annual_evaluations.view',
} as const satisfies Record<string, CapabilityKey>;

/** Every key the crew manifest declares (ModuleManifest.capabilities). */
export const CREW_CAPABILITIES: readonly CapabilityKey[] = Object.values(CREW_CAPS);
