/**
 * The one report registry (DECISIONS C12, D-X5-11; gap/02 R1). Data only:
 * every report STORM offers, fleet or vessel, is one `ReportDefinition`
 * here, and the hub, the report page, the "Switch report" picker and the
 * dashboard's KPI links all read it. A report page is a lazy loader
 * (`load`), so nothing here pulls a report's code or its libraries into the
 * chunk that imports the registry; a legacy page that keeps its own route is
 * an `href` (relative to the scope's reports root).
 *
 * - `scope`: where the report is offered: `fleet` (`/fleet/reports/<key>`),
 *   `vessel` (`/v/:vesselCode/reports/<key>`, X4 extends the registry with
 *   these and the vessel hub) or `both`.
 * - `capability`: the PMS key a reader needs (useCan, fails closed). The hub
 *   hides a card the reader cannot open; the report page answers
 *   AccessDenied.
 * - `personalData`: the report shows or exports data about people (EX4,
 *   D-X5-12); the export engine refuses it while the export log is not set
 *   up.
 * - `exporters`: the formats its ExportMenu offers (PR-13's engine). A
 *   registry page (`load`) always has at least one: it exports the rows on
 *   screen through ReportShell. A legacy page (`href`) has none and says
 *   who will add its export (`exportDeferred`; D-384): the hub shows "No
 *   export yet" on its card and the page offers no export control.
 *
 * Adding a report: one entry here (unique key, a group of
 * `REPORT_GROUPS`, a capability of the catalogue) and its component under
 * ./reports/; src/test/reports/registry.test.ts checks every loader and
 * href resolves and every capability is in the catalogue.
 */
import type { ComponentType } from 'react';
import type { CapabilityKey } from '@/lib/permissions/types';
import { FLEET_REPORTS_ROOT, REPORTS_CAPS } from './paths';

export type ReportScope = 'fleet' | 'vessel' | 'both';

/** A format a report exports (the export engine's `ExportFormat`). */
export type ReportExporter = 'csv' | 'xlsx' | 'pdf';

export const REPORT_GROUPS = [
  { id: 'fleet', title: 'Fleet', description: 'The vessels side by side.' },
  { id: 'documents', title: 'Documents and certificates', description: 'What has expired and what is coming up.' },
  { id: 'crew', title: 'Crew', description: 'Qualifications, hours of rest and agreements.' },
  { id: 'safety', title: 'Safety', description: 'Incidents, corrective actions and drills.' },
  { id: 'technical', title: 'Technical', description: 'Jobs, surveys and the work list.' },
  { id: 'risk', title: 'Risk', description: 'The fleet risk picture.' },
] as const;

export type ReportGroupId = (typeof REPORT_GROUPS)[number]['id'];

/** What a report component receives from the report page. */
export interface ReportComponentProps {
  definition: ReportDefinition;
}

export type ReportLoader = () => Promise<{ default: ComponentType<ReportComponentProps> }>;

interface ReportDefinitionBase {
  /** URL segment and stable id (kebab-case). */
  key: string;
  scope: ReportScope;
  group: ReportGroupId;
  title: string;
  /** One sentence: what the report answers. */
  description: string;
  /** The module the data comes from, shown as a chip. */
  moduleChip: string;
  capability: CapabilityKey;
  personalData: boolean;
  exporters: readonly ReportExporter[];
}

/** A registry-driven report page, or a legacy page that keeps its own route. */
export type ReportDefinition =
  | (ReportDefinitionBase & { load: ReportLoader; href?: never; exportDeferred?: never })
  | (ReportDefinitionBase & {
      href: string;
      load?: never;
      /** Who adds the export of this legacy page, while it has none (D-384). */
      exportDeferred?: string;
    });

export const REPORTS: readonly ReportDefinition[] = [
  {
    key: 'vessel-comparison',
    scope: 'fleet',
    group: 'fleet',
    title: 'Vessel comparison',
    description: 'Each vessel’s documents, safety, technical, insurance and hours of rest side by side, worst first.',
    moduleChip: 'Fleet',
    capability: REPORTS_CAPS.view,
    personalData: false,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/VesselComparisonReport'),
  },
  {
    key: 'fleet-list',
    scope: 'fleet',
    group: 'fleet',
    title: 'Fleet list',
    description: 'Every vessel’s particulars, fleet group, crew on board and certificate health.',
    moduleChip: 'Fleet',
    capability: REPORTS_CAPS.view,
    personalData: false,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/FleetListReport'),
  },
  {
    key: 'fleet-certificates',
    scope: 'fleet',
    group: 'documents',
    title: 'Fleet certificates',
    description: 'Vessel certificates that have expired or are due, most urgent first, with their endorsements.',
    moduleChip: 'Certificates',
    // The vessel certificates read (fleet_ops_can 'certificates'), on top of the reports route guard.
    capability: 'vessel.certificates.status_summary.view',
    personalData: false,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/FleetCertificatesReport'),
  },
  {
    key: 'crew-documents',
    scope: 'fleet',
    group: 'documents',
    title: 'Crew documents',
    description: 'Crew passports, visas, certificates and medicals that have expired or are due, with each type’s warning window.',
    moduleChip: 'Crew',
    // The crew documents read (fleet_ops_can 'crew_documents'), on top of the reports route guard.
    capability: 'vessel.crew.crew_certificates.view',
    personalData: true,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/CrewDocumentsReport'),
  },
  {
    key: 'insurance',
    scope: 'fleet',
    group: 'documents',
    title: 'Insurance',
    description: 'Each vessel’s P&I, hull and machinery, crew and other cover: insurer, policy number and when it ends, most urgent first.',
    moduleChip: 'Insurance',
    // The insurance read (fleet_ops_can 'insurance'), on top of the reports route guard; fleet policies need fleet reach.
    capability: 'vessel.management.office_insurance.view',
    personalData: false,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/InsuranceReport'),
  },
  {
    key: 'crew-qualifications',
    scope: 'fleet',
    group: 'crew',
    title: 'Crew qualifications',
    description: 'Each crew member’s documents, STCW certificates, qualifications and familiarisation against what their position requires.',
    moduleChip: 'Crew',
    // The crew compliance read (X1's requirement engine), on top of the reports route guard.
    capability: 'vessel.crew.crew_compliance.view',
    personalData: true,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/CrewQualificationsReport'),
  },
  {
    key: 'hours-of-rest',
    scope: 'fleet',
    group: 'crew',
    title: 'Hours of rest',
    description: 'Breaches, serious breach days and months not submitted across the fleet, with a heat map by vessel and day.',
    moduleChip: 'Crew',
    // The hours-of-rest read (fleet_dashboard_tile_can_for), on top of the reports route guard.
    capability: 'vessel.crew.hours_of_rest.view',
    personalData: true,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/HoursOfRestReport'),
  },
  {
    key: 'agreements',
    scope: 'fleet',
    group: 'crew',
    title: 'Agreements',
    description: 'Seafarer employment agreements in draft or in force, and who still has to sign them.',
    moduleChip: 'HR',
    // The HR records read (fleet_ops_can 'hr'), on top of the reports route guard.
    capability: 'hris.employee_records.contracts_employment.view',
    personalData: true,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/AgreementsReport'),
  },
  {
    key: 'contracts-ending',
    scope: 'fleet',
    group: 'crew',
    title: 'Contracts ending',
    description: 'Active contracts that have ended or end within 90 days, soonest first, and whether a renewal is drafted.',
    moduleChip: 'HR',
    capability: 'hris.employee_records.contracts_employment.view',
    personalData: true,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/ContractsEndingReport'),
  },
  {
    key: 'overdue-drills',
    scope: 'fleet',
    group: 'safety',
    title: 'Overdue drills',
    description: 'Scheduled drills that were missed and required drills past their interval on each vessel, most overdue first.',
    moduleChip: 'Safety',
    // The drills read (fleet_dashboard_tile_can_for 'drills'), on top of the reports route guard.
    capability: 'vessel.safety.drills.view',
    personalData: false,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/OverdueDrillsReport'),
  },
  {
    key: 'incident-analytics',
    scope: 'fleet',
    group: 'safety',
    title: 'Incident analytics',
    description: 'Incident trends, causes and severity across the fleet.',
    moduleChip: 'Safety',
    capability: 'vessel.safety.incidents.view',
    personalData: false,
    exporters: [],
    exportDeferred: 'X2 (R6)',
    href: 'incident-analytics',
  },
  {
    key: 'capa-tracker',
    scope: 'fleet',
    group: 'safety',
    title: 'CAPA tracker',
    description: 'Corrective and preventive actions: open, overdue and closed.',
    moduleChip: 'Safety',
    capability: 'vessel.safety.capa.view',
    personalData: false,
    exporters: [],
    exportDeferred: 'X2 (R6)',
    href: 'capa-tracker',
  },
  {
    key: 'drill-analytics',
    scope: 'fleet',
    group: 'safety',
    title: 'Drill analytics',
    description: 'Drills carried out, missed and overdue on each vessel.',
    moduleChip: 'Safety',
    capability: 'vessel.safety.drills.view',
    personalData: false,
    exporters: [],
    exportDeferred: 'X5 wave 2',
    href: 'drill-analytics',
  },
  {
    key: 'audits-surveys',
    scope: 'fleet',
    group: 'technical',
    title: 'Audits and surveys',
    description: 'Audits and certificate surveys across the fleet: overdue first, with their outcome, auditor and findings.',
    moduleChip: 'Safety',
    // The audits read (fleet_dashboard_tile_can_for 'audits_surveys'); surveys also follow the certificates read.
    capability: 'vessel.safety.audits_surveys.view',
    // Auditors are named.
    personalData: true,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/AuditsSurveysReport'),
  },
  {
    key: 'work-list',
    scope: 'fleet',
    group: 'technical',
    title: 'Work list',
    description: 'Open, overdue and awaiting-approval jobs on each vessel, with the overdue jobs most overdue first.',
    moduleChip: 'Technical',
    // The jobs read (fleet_dashboard_tile_can_for 'technical'), on top of the reports route guard.
    capability: 'vessel.technical.tasks.view',
    personalData: false,
    exporters: ['csv', 'xlsx', 'pdf'],
    load: () => import('./reports/WorkListReport'),
  },
  {
    key: 'risk-overview',
    scope: 'fleet',
    group: 'risk',
    title: 'Risk overview',
    description: 'The fleet risk register and safety performance in one place.',
    moduleChip: 'Safety',
    capability: 'vessel.safety.emergency_response.view',
    personalData: false,
    exporters: [],
    exportDeferred: 'X5 wave 2',
    href: 'risk-overview',
  },
];

const offeredIn = (definition: ReportDefinition, scope: 'fleet' | 'vessel') => definition.scope === scope || definition.scope === 'both';

/** The reports offered in a scope, in registry order. */
export function reportsForScope(scope: 'fleet' | 'vessel'): ReportDefinition[] {
  return REPORTS.filter((r) => offeredIn(r, scope));
}

/** The report with this key in this scope, or null (unknown key, or another scope's report). */
export function getReport(key: string | null | undefined, scope: 'fleet' | 'vessel'): ReportDefinition | null {
  if (!key) return null;
  return REPORTS.find((r) => r.key === key && offeredIn(r, scope)) ?? null;
}

/** The keys of every fleet report: a dashboard number links only to one of these (gap/02 W9). */
export const FLEET_REPORT_KEYS: ReadonlySet<string> = new Set(reportsForScope('fleet').map((r) => r.key));

/**
 * The fleet URL of a report: `/fleet/reports/<key>` for a registry page,
 * `/fleet/reports/<href>` for a legacy page. `query` is appended (the
 * caller's `?vessels=`, a report's own filters).
 */
export function fleetReportPath(definition: ReportDefinition, query?: URLSearchParams | string | null): string {
  const tail = definition.href ?? definition.key;
  const search = typeof query === 'string' ? query.replace(/^\?/, '') : query?.toString() ?? '';
  return `${FLEET_REPORTS_ROOT}/${tail}${search ? `?${search}` : ''}`;
}
