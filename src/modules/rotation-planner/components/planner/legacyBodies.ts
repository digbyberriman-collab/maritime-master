/**
 * The legacy planner bodies (D-01): the lane planner, the day-code leave
 * grid and the requests page as they were before X1-09B. The planner shows
 * them while 20261124060900 is not applied (the new RPCs are missing), and
 * on the legacy URLs for users without a vessel (D-27, D-45). Each loads
 * only when needed (gap/00 I6); their files keep the legacy code so their
 * lint and palette counts never move to a new file.
 */
import React from 'react';

export const LegacyRotationPlanner = React.lazy(() =>
  import('@/modules/rotation-planner/pages/RotationPlannerPage').then((m) => ({ default: m.LegacyRotationPlanner })),
);

export const LegacyLeavePlanner = React.lazy(() => import('@/modules/crew/pages/LeavePlannerPage').then((m) => ({ default: m.LegacyLeavePlanner })));

export const LegacyLeaveRequests = React.lazy(() => import('@/modules/crew/pages/LeaveRequestsPage').then((m) => ({ default: m.LegacyLeaveRequests })));
