/**
 * React Query keys of the reports module. Every key carries the company id
 * and the vessel ids it was read for (sorted, so the same vessels in another
 * order share an entry), whether the read was fleet-wide (the default
 * "Vessels shown", sent as NULL) and the day it counted for. Invalidate by
 * prefix: `reportsKeys.company(companyId)`.
 *
 * The hub's current-position tiles and the Vessel comparison report read the
 * dashboard's RPCs under `dashboardKeys` (@/modules/dashboard/hooks/useFleetDashboard).
 */
const NONE = 'none';
const sortedIds = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

const company = (companyId: string | null | undefined) => ['reports', 'company', companyId ?? NONE] as const;

export const reportsKeys = {
  all: ['reports'] as const,
  company,
  trends: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean; months: number; today: string }) =>
    [...company(companyId), 'trends', sortedIds(vesselIds), { fleetWide: opts.fleetWide, months: opts.months, today: opts.today }] as const,
  vesselList: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean; today: string }) =>
    [...company(companyId), 'vessel-list', sortedIds(vesselIds), { fleetWide: opts.fleetWide, today: opts.today }] as const,
  /** R5 crew qualifications (X1's compliance summaries through fleet_report_crew_qualifications). */
  crewQualifications: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean }) =>
    [...company(companyId), 'crew-qualifications', sortedIds(vesselIds), { fleetWide: opts.fleetWide }] as const,
  /** R9 hours of rest over a period (from .. to inclusive). */
  hoursOfRest: (
    companyId: string | null | undefined,
    vesselIds: readonly string[],
    opts: { fleetWide: boolean; from: string; to: string; today: string },
  ) => [...company(companyId), 'hours-of-rest', sortedIds(vesselIds), { fleetWide: opts.fleetWide, from: opts.from, to: opts.to, today: opts.today }] as const,
  /** R10 agreements / R11 contracts ending. */
  contracts: (
    companyId: string | null | undefined,
    vesselIds: readonly string[],
    opts: { fleetWide: boolean; mode: 'agreements' | 'ending'; today: string },
  ) => [...company(companyId), 'contracts', opts.mode, sortedIds(vesselIds), { fleetWide: opts.fleetWide, today: opts.today }] as const,
  /** R7 overdue drills. */
  overdueDrills: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean; today: string }) =>
    [...company(companyId), 'overdue-drills', sortedIds(vesselIds), { fleetWide: opts.fleetWide, today: opts.today }] as const,
  /** R13 insurance. */
  insurance: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean; today: string }) =>
    [...company(companyId), 'insurance', sortedIds(vesselIds), { fleetWide: opts.fleetWide, today: opts.today }] as const,
  /** R17 audits and surveys over a period (from .. to inclusive). */
  audits: (
    companyId: string | null | undefined,
    vesselIds: readonly string[],
    opts: { fleetWide: boolean; from: string; to: string; today: string },
  ) => [...company(companyId), 'audits-surveys', sortedIds(vesselIds), { fleetWide: opts.fleetWide, from: opts.from, to: opts.to, today: opts.today }] as const,
  /** R18 work list. */
  workList: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean; today: string }) =>
    [...company(companyId), 'work-list', sortedIds(vesselIds), { fleetWide: opts.fleetWide, today: opts.today }] as const,
};
