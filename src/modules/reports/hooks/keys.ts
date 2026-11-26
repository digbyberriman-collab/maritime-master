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
};
