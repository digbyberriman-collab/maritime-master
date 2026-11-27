/**
 * The crew list's On/Off quick toggle (gap/04 C4; X1-09B): when it applies
 * to a row, and whether the viewer may use it on the route vessel.
 *
 * - toggleDirectionFor: Off for someone on board, On for someone on leave,
 *   nothing for a pending placement, a transfer or anyone ashore (the
 *   server toggles crew assigned that day only, 22023 person_not_on_vessel).
 * - useOnboardToggleAccess: vessel.crew.crew_scheduling.edit on the route
 *   vessel (fail closed) and the planner engine applied (leave_types
 *   answers; D-01: the toggle stays hidden while 20261124060900 is missing).
 */
import { useCan } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { CREW_CAPS } from '@/modules/crew/paths';
import type { CrewListRow } from '@/modules/crew/lib/crewListModel';
import type { LeaveType } from '../../lib/leaveTypes';
import { useLeaveTypes } from '../../hooks/useLeaveTypes';

export function toggleDirectionFor(row: Pick<CrewListRow, 'status' | 'placementKind'>): 'off' | 'on' | null {
  if (row.placementKind !== 'assignment') return null;
  if (row.status === 'on_board') return 'off';
  if (row.status === 'on_leave') return 'on';
  return null;
}

export interface ToggleVessel {
  id: string;
  companyId: string;
  name: string;
}

export type OnboardToggleAccess =
  | { available: false }
  | { available: true; vessel: ToggleVessel; types: readonly LeaveType[] };

export function useOnboardToggleAccess(): OnboardToggleAccess {
  const scope = useScope();
  const v = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const canEdit = useCan(CREW_CAPS.schedulingEdit, { vesselId: v?.id ?? null });
  const types = useLeaveTypes(v?.company_id, { enabled: canEdit && Boolean(v) });
  if (!v || !canEdit || types.status !== 'ready') return { available: false };
  return { available: true, vessel: { id: v.id, companyId: v.company_id, name: v.name }, types: types.types };
}
