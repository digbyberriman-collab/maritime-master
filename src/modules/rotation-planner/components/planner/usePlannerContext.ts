/**
 * What the planner tabs share (X1-09B): the viewer's planner capabilities on
 * the vessel (useCan, fail closed) and the vessel's crew as planner rows
 * (crew_vessel_list on today, X1-02). The server gates every read and write
 * again; these answers only decide what the page offers.
 */
import { useMemo } from 'react';
import { useCan } from '@/lib/permissions/useCan';
import { CREW_CAPS } from '@/modules/crew/paths';
import { useVesselCrewList } from '@/modules/crew/hooks/useVesselCrewList';
import { positionLabel, type CrewListRow } from '@/modules/crew/lib/crewListModel';
import type { PlannerVesselRef } from '../../hooks/plannerKeys';
import type { PlannerCrewMember } from './plannerModel';

/** The route vessel as the planner tabs use it. */
export interface PlannerVessel extends PlannerVesselRef {
  name: string;
}

export interface PlannerAccess {
  /** vessel.crew.crew_scheduling.edit: periods, the toggle, Add leave. */
  canEdit: boolean;
  /** hris.leave_rotation.leave_requests.approve: personal leave written directly, request decisions. */
  canApproveLeave: boolean;
  /** vessel.crew.crew_compliance.admin: position manning (crew_vessel_positions_save). */
  canAdminManning: boolean;
  /** vessel.crew.crew_list.view: the crew list the rows come from. */
  canSeeCrewList: boolean;
}

export function usePlannerAccess(vesselId: string): PlannerAccess {
  const ctx = { vesselId };
  const canEdit = useCan(CREW_CAPS.schedulingEdit, ctx);
  const canApproveLeave = useCan(CREW_CAPS.leaveApprove, ctx);
  const canAdminManning = useCan(CREW_CAPS.complianceAdmin, ctx);
  const canSeeCrewList = useCan(CREW_CAPS.crewListView, ctx);
  return useMemo(() => ({ canEdit, canApproveLeave, canAdminManning, canSeeCrewList }), [canEdit, canApproveLeave, canAdminManning, canSeeCrewList]);
}

/** A crew list row as a planner member, with the role facts the request decisions mirror. */
export interface PlannerCrewRow extends PlannerCrewMember {
  rankTier: string | null;
  isMasterOffice: boolean;
  status: CrewListRow['status'];
  placementKind: CrewListRow['placementKind'];
}

export const toPlannerCrewRow = (r: CrewListRow): PlannerCrewRow => ({
  profileId: r.profileId,
  userId: r.userId,
  name: r.preferredName ? `${r.preferredName} ${r.lastName}`.trim() : `${r.firstName} ${r.lastName}`.trim() || r.displayName,
  positionLabel: positionLabel(r),
  departmentKey: r.departmentKey,
  departmentLabel: r.departmentLabel,
  sortOrder: r.sortOrder,
  rankTier: r.rankTier,
  isMasterOffice: r.isMasterOffice,
  status: r.status,
  placementKind: r.placementKind,
});

export type PlannerCrewState =
  | { status: 'loading' }
  /** The list is not readable (not applied, no crew list access, or failed): the planner shows people from their periods. */
  | { status: 'unavailable'; reason: 'not_set_up' | 'no_access' | 'error'; error?: unknown; retry?: () => void }
  | { status: 'ready'; members: PlannerCrewRow[] };

/** The vessel's crew today as planner rows. */
export function usePlannerCrew(vessel: PlannerVessel, today: string, canSeeCrewList: boolean): PlannerCrewState {
  const list = useVesselCrewList({ id: vessel.id, companyId: vessel.companyId }, today, { enabled: canSeeCrewList });
  return useMemo<PlannerCrewState>(() => {
    if (!canSeeCrewList) return { status: 'unavailable', reason: 'no_access' };
    switch (list.status) {
      case 'idle':
      case 'loading':
        return { status: 'loading' };
      case 'fallback':
        return { status: 'unavailable', reason: 'not_set_up' };
      case 'error':
        return { status: 'unavailable', reason: 'error', error: list.error, retry: list.retry };
      case 'ready':
        return { status: 'ready', members: list.rows.map(toPlannerCrewRow) };
    }
  }, [canSeeCrewList, list]);
}
