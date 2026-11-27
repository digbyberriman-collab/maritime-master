import React, { Suspense } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageError, PageLoading } from '@/shared/components/states';
import { useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings } from '@/modules/vessels/lib/moduleSettings';
import { CREW_CAPS } from '@/modules/crew/paths';
import { localToday } from '../lib/duration';
import { PLANNER_NOT_SET_UP_NOTICE } from '../lib/periods';
import type { LeaveType } from '../lib/leaveTypes';
import { useLeaveTypes } from '../hooks/useLeaveTypes';
import { LegacyLeavePlanner, LegacyLeaveRequests, LegacyRotationPlanner } from '../components/planner/legacyBodies';
import {
  PLANNER_TAB_LABEL,
  parsePlannerTab,
  plannerTabPath,
  visiblePlannerTabs,
  type PlannerTab,
} from '../components/planner/plannerModel';
import { usePlannerAccess, usePlannerCrew, type PlannerVessel } from '../components/planner/usePlannerContext';
import { TimelineTab } from '../components/planner/TimelineTab';

// Each tab past the timeline loads when it is opened (gap/00 I6).
const ManningTab = React.lazy(() => import('../components/planner/ManningTab'));
const RequestsTab = React.lazy(() => import('../components/planner/RequestsTab'));
const ConfigurationTab = React.lazy(() => import('../components/planner/ConfigurationTab'));
const FleetPlanner = React.lazy(() => import('../components/planner/FleetPlanner'));

const tabLink = (active: boolean) =>
  cn(
    'relative inline-flex h-full shrink-0 snap-start items-center whitespace-nowrap rounded-sm px-3 type-body font-medium transition-colors duration-quick ease-tide',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    'after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-transform after:duration-indicator after:ease-tide',
    active ? 'text-foreground after:scale-x-100 after:shadow-glow-signal' : 'text-muted-foreground after:scale-x-0 hover:text-foreground',
  );

const PlannerTabs: React.FC<{ tabs: readonly PlannerTab[]; active: PlannerTab; hrefOf: (tab: PlannerTab) => string }> = ({ tabs, active, hrefOf }) => (
  <nav aria-label="Planner sections" className="min-w-0">
    <ul
      className="flex h-11 max-w-full items-stretch gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain shadow-[inset_0_-1px_0_0_hsl(var(--border))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-planner-tabs=""
    >
      {tabs.map((t) => (
        <li key={t} className="flex shrink-0">
          <Link to={hrefOf(t)} aria-current={t === active ? 'page' : undefined} className={tabLink(t === active)}>
            {PLANNER_TAB_LABEL[t]}
          </Link>
        </li>
      ))}
    </ul>
  </nav>
);

const TabFallback: React.FC = () => <PageLoading variant="list" rows={6} label="Loading the planner" />;

/** The legacy URLs of the planner tabs (D-45): the timeline, the leave grid and the requests. */
const LEGACY_TAB_URL: Readonly<Record<Exclude<PlannerTab, 'configuration'>, string>> = {
  timeline: '/crew/rotation-planner',
  manning: '/crew/leave',
  requests: '/crew/leave/requests',
};

export interface PlannerPageProps {
  /** The legacy wrappers (/crew/leave, /crew/leave/requests, /crew/rotation-planner) name their tab. */
  tab?: PlannerTab;
}

/**
 * The planner (gap/04 C47-C50, C52, C4, W7; X1-09B; DECISIONS R2).
 *
 * - Vessel scope, crew/planner/:tab: Timeline, Manning, Requests and
 *   Configuration. Guarded by vessel.crew.crew_scheduling.view (the route
 *   guard and here, for the route vessel: nothing is read while it loads,
 *   AccessDenied when denied). The title follows the vessel's label for the
 *   module ("Leave" on vessels that rename it). An unknown tab lands on the
 *   timeline.
 * - Fleet scope, /fleet/planner?tab=crew: the vessels' planners stacked
 *   (FleetPlanner).
 * - The legacy URLs (no scope, users without a vessel, D-27): the legacy
 *   pages as the tabs.
 *
 * D-01: until 20261124060900 is applied leave_types is missing; the tabs
 * keep the legacy planner (lane planner, day-code grid, requests page)
 * under a notice, and Configuration is hidden. Any other error of the
 * planner's first read is PageError with Retry.
 */
const PlannerPage: React.FC<PlannerPageProps> = ({ tab }) => {
  const scope = useScope();
  if (scope.scope === 'vessel' && scope.vessel) {
    const v = scope.vessel;
    return <VesselPlanner key={v.id} vessel={{ id: v.id, companyId: v.company_id, name: v.name }} forcedTab={tab ?? null} />;
  }
  if (scope.scope === 'fleet') {
    return (
      <Suspense fallback={<TabFallback />}>
        <FleetPlanner />
      </Suspense>
    );
  }
  return <LegacyPlanner tab={tab ?? 'timeline'} />;
};

/** The legacy URLs' planner: the legacy page of the tab, with links to the others. */
const LegacyPlanner: React.FC<{ tab: PlannerTab }> = ({ tab }) => {
  const active = tab === 'configuration' ? 'timeline' : tab;
  return (
    <div className="min-w-0 space-y-3" data-planner-scope="legacy">
      <PlannerTabs tabs={['timeline', 'manning', 'requests']} active={active} hrefOf={(t) => LEGACY_TAB_URL[t === 'configuration' ? 'timeline' : t]} />
      <Suspense fallback={<TabFallback />}>
        {active === 'timeline' ? <LegacyRotationPlanner /> : active === 'manning' ? <LegacyLeavePlanner embedded /> : <LegacyLeaveRequests embedded />}
      </Suspense>
    </div>
  );
};

const VesselPlanner: React.FC<{ vessel: PlannerVessel; forcedTab: PlannerTab | null }> = ({ vessel, forcedTab }) => {
  const params = useParams();
  const location = useLocation();
  const scopedPath = useScopedPath();
  const gate = useCapability(CREW_CAPS.schedulingView, { vesselId: vessel.id });
  const parsed = forcedTab ?? parsePlannerTab(params.tab);
  const settings = useVesselModuleSettings(vessel.id);
  const label = resolveModuleSettings(settings.state, localIsoDate()).labelFor('planner') ?? 'Planner';
  const leaveTypes = useLeaveTypes(vessel.companyId, { enabled: gate.allowed });

  if (parsed === null) return <Navigate to={`${scopedPath(plannerTabPath('timeline'))}${location.search}`} replace />;
  if (gate.status === 'loading') return <PageLoading variant="list" rows={6} label="Checking your access" />;
  if (!gate.allowed) {
    return (
      <AccessDenied
        title={`You can't see the ${label.toLowerCase()} of this vessel`}
        detail="The crew planner needs crew scheduling access on this vessel. Ask your fleet manager for it."
      />
    );
  }
  if (leaveTypes.status === 'idle' || leaveTypes.status === 'loading') return <PageLoading variant="list" rows={6} label="Loading the planner" />;
  if (leaveTypes.status === 'error') {
    return <PageError error={leaveTypes.error} onRetry={leaveTypes.retry} title="The planner could not load" treatMissingAsOff={false} />;
  }
  const engine = leaveTypes.status === 'ready';
  if (parsed === 'configuration' && !engine) return <Navigate to={`${scopedPath(plannerTabPath('timeline'))}${location.search}`} replace />;
  return <VesselPlannerBody vessel={vessel} tab={parsed} label={label} engine={engine} types={leaveTypes.types} />;
};

const VesselPlannerBody: React.FC<{ vessel: PlannerVessel; tab: PlannerTab; label: string; engine: boolean; types: readonly LeaveType[] }> = ({
  vessel,
  tab,
  label,
  engine,
  types,
}) => {
  const scopedPath = useScopedPath();
  const location = useLocation();
  const access = usePlannerAccess(vessel.id);
  const today = localToday();
  const crew = usePlannerCrew(vessel, today, access.canSeeCrewList && engine);
  const { user, profile } = useAuth();
  const { fleetReach } = useScopeAccess();
  const keep = new URLSearchParams(location.search);
  keep.delete('dept');
  const query = keep.get('crew') ? `?crew=${encodeURIComponent(keep.get('crew') as string)}` : '';

  return (
    <div className="min-w-0 space-y-4" data-planner={tab} data-planner-engine={engine ? 'on' : 'legacy'}>
      <PageHeader
        eyebrow={vessel.name}
        title={label}
        description="Who is on board and who is off: rotations, leave, requests and the manning they leave on board."
      />
      <PlannerTabs tabs={visiblePlannerTabs(engine)} active={tab} hrefOf={(t) => `${scopedPath(plannerTabPath(t))}${query}`} />
      {!engine ? (
        <Alert variant="info" data-planner-notice="not-applied">
          <Info aria-hidden="true" className="size-4" />
          <AlertDescription>{PLANNER_NOT_SET_UP_NOTICE}</AlertDescription>
        </Alert>
      ) : null}
      <Suspense fallback={<TabFallback />}>
        {!engine ? (
          tab === 'timeline' ? (
            <LegacyRotationPlanner lockedVesselId={vessel.id} />
          ) : tab === 'manning' ? (
            <LegacyLeavePlanner embedded />
          ) : (
            <LegacyLeaveRequests embedded />
          )
        ) : tab === 'timeline' ? (
          <TimelineTab vessel={vessel} access={access} crew={crew} types={types} today={today} viewerProfileId={profile?.id ?? null} />
        ) : tab === 'manning' ? (
          <ManningTab vessel={vessel} access={access} crew={crew} types={types} today={today} />
        ) : tab === 'requests' ? (
          <RequestsTab
            vessel={vessel}
            access={access}
            crew={crew}
            types={types}
            today={today}
            viewerProfileId={profile?.id ?? null}
            viewerUserId={user?.id ?? null}
            fleetReach={fleetReach}
          />
        ) : (
          <ConfigurationTab vessel={vessel} access={access} types={types} today={today} />
        )}
      </Suspense>
    </div>
  );
};

export default PlannerPage;
