/**
 * React Query keys of the Hours of Work and Rest module. Every key carries
 * its scope: the vessel, and the crew member's login for a person's month
 * (one month per person and vessel, D-X1-20). Invalidate a person's month
 * after a save or a sign-off with `workRestKeys.month(...)`; the vessel's
 * keys (`workRestKeys.vessel(vesselId)`) cover its board and report
 * (X1-08).
 */
export const workRestKeys = {
  all: ['work-rest'] as const,
  vessel: (vesselId: string) => [...workRestKeys.all, 'vessel', vesselId] as const,
  ruleSet: (vesselId: string) => [...workRestKeys.vessel(vesselId), 'rule-set'] as const,
  person: (vesselId: string, crewId: string) => [...workRestKeys.vessel(vesselId), 'person', crewId] as const,
  month: (vesselId: string, crewId: string, year: number, month: number) =>
    [...workRestKeys.person(vesselId, crewId), 'month', year, month] as const,
  board: (vesselId: string, year: number, month: number) => [...workRestKeys.vessel(vesselId), 'board', year, month] as const,
};
