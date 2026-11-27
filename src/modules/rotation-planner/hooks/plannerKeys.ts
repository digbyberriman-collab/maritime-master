/**
 * React Query keys of the planner's server reads (X1-09; X1 spec §3
 * "Keys"). Every key of vessel data carries the company id and the vessel
 * id, so two vessels (or a vessel switch) never share a cache entry; the
 * leave types are one STORM list, keyed under the company all the same so a
 * company switch refetches them.
 *
 * Invalidate by prefix: `plannerKeys.vessel(companyId, vesselId)` covers
 * every planner read of one vessel (periods, manning, requests, settings).
 * The legacy planner's own keys (`['frp', …]`, usePlannerData) are not
 * scoped; a planner write invalidates them too (LEGACY_PLANNER_KEY) until
 * X1-09B moves the timeline onto these reads.
 */
const NONE = 'none';

/** The vessel a planner read or write is about (its company scopes the keys). */
export interface PlannerVesselRef {
  id: string;
  companyId: string;
}

export const plannerKeys = {
  all: ['planner'] as const,
  company: (companyId: string | null | undefined) => ['planner', 'company', companyId ?? NONE] as const,
  leaveTypes: (companyId: string | null | undefined) => [...plannerKeys.company(companyId), 'leave-types'] as const,
  vessel: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    ['planner', 'company', companyId ?? NONE, 'vessel', vesselId ?? NONE] as const,
  periods: (companyId: string | null | undefined, vesselId: string | null | undefined, from: string, to: string) =>
    [...plannerKeys.vessel(companyId, vesselId), 'periods', from, to] as const,
  manning: (companyId: string | null | undefined, vesselId: string | null | undefined, from: string, to: string) =>
    [...plannerKeys.vessel(companyId, vesselId), 'manning', from, to] as const,
  leaveRequests: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...plannerKeys.vessel(companyId, vesselId), 'leave-requests'] as const,
  leaveSettings: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...plannerKeys.vessel(companyId, vesselId), 'leave-settings'] as const,
};

/** The legacy planner's unscoped keys (usePlannerData): refreshed after a planner write. */
export const LEGACY_PLANNER_KEY = ['frp'] as const;
