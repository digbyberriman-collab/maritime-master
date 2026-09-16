import { useCrewEditAccess, type CrewEditAccess } from '@/shared/hooks/useCrewEditAccess';

export type PlannerAccess = CrewEditAccess;

/** Planner-facing alias of the shared rotation/leave/travel edit gate. */
export function usePlannerPermissions(): PlannerAccess {
  return useCrewEditAccess();
}
