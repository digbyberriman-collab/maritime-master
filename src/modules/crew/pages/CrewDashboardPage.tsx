import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { List, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageEmpty, PageLoading } from '@/shared/components/states';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { todayDateOnly } from '@/shared/lib/form';
import { CREW_CAPS, CREW_PATHS, CREW_ROOT } from '@/modules/crew/paths';
import { useCrewDashboard } from '@/modules/crew/hooks/useCrewDashboard';
import { useVesselOnboarding } from '@/modules/crew/hooks/useOnboardingProgress';
import {
  cardState,
  dashboardActions,
  dashboardAllClear,
  dashboardTiles,
  type DashboardAccess,
  type DashboardQuery,
} from '@/modules/crew/lib/dashboardModel';
import { DashboardTiles } from '@/modules/crew/components/dashboard/DashboardTiles';
import { ActionRequired } from '@/modules/crew/components/dashboard/ActionRequired';
import { OnboardingCard } from '@/modules/crew/components/dashboard/OnboardingCard';
import { HoursOfRestCard } from '@/modules/crew/components/dashboard/HoursOfRestCard';
import { DocumentsCard } from '@/modules/crew/components/dashboard/DocumentsCard';

interface DashboardVessel {
  id: string;
  companyId: string;
  name: string;
}

const DENIED_DETAIL = 'The crew dashboard needs crew list access on this vessel. Ask your fleet manager for it.';

/**
 * The vessel crew dashboard (gap/04 C2, C18; X1-10B) at /v/:vesselCode/crew:
 * five KPI tiles (Crewing, Compliance, Onboarding, Documents, Hours of rest),
 * Action required, and the Onboarding, Hours of rest and Documents &
 * certificates cards. Every number links to the list it summarises.
 *
 * Gate: vessel.crew.crew_list.view on the route vessel (the route guard
 * checks it too): nothing is read while it loads, AccessDenied when denied;
 * the server gates the dashboard and each of its sections again, so a
 * source the viewer may not read is hidden, never shown as 0.
 *
 * D-01: while crew_vessel_dashboard is missing every tile says it turns on
 * with the crew update and the cards say the same; the page never blanks.
 * Any other failure is each tile's error with Try again.
 */
const CrewDashboardPage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const gate = useCapability(CREW_CAPS.crewListView, { vesselId: vessel?.id ?? null });

  if (!vessel) {
    return <PageEmpty title="Choose a vessel" body="The crew dashboard belongs to a vessel. Open it from a vessel's Crew tab." />;
  }
  if (gate.status === 'loading') return <PageLoading variant="tiles" rows={5} label="Checking your access" />;
  if (!gate.allowed) return <AccessDenied title="You can't see this vessel's crew" detail={DENIED_DETAIL} />;
  return <DashboardBody key={vessel.id} vessel={{ id: vessel.id, companyId: vessel.company_id, name: vessel.name }} />;
};

/** Jumps to the card a tile points at (`crew#<anchor>`) and moves focus to it. */
function useAnchorFocus() {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!el) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }, [location.hash, location.key]);
}

const DashboardBody: React.FC<{ vessel: DashboardVessel }> = ({ vessel }) => {
  const scopedPath = useScopedPath();
  const ctx = { vesselId: vessel.id };
  const access: DashboardAccess = {
    compliance: useCan(CREW_CAPS.complianceView, ctx),
    documents: useCan(CREW_CAPS.documentsView, ctx),
    hoursOfRest: useCan(CREW_CAPS.horView, ctx),
  };
  const canApproveHor = useCan(CREW_CAPS.horApprove, ctx);
  const canViewFamiliarisation = useCan(CREW_CAPS.famView, ctx);
  const canOpenProfiles = useCan(CREW_CAPS.profilesView, ctx);
  const canAddCrew = useCan(CREW_CAPS.profilesCreate, ctx);
  const dashboard = useCrewDashboard(vessel, true);
  const onboarding = useVesselOnboarding(vessel, { enabled: true });
  useAnchorFocus();

  if (dashboard.status === 'denied') return <AccessDenied title="You can't see this vessel's crew" detail={DENIED_DETAIL} />;

  const query: DashboardQuery = dashboard.status === 'query' ? dashboard.query : { status: 'loading' };
  const retry = dashboard.status === 'query' ? dashboard.retry : () => undefined;
  const ready = query.status === 'ready' ? query.dashboard : null;
  const tiles = dashboardTiles(query, access);
  const actions = ready ? dashboardActions(ready, { canApproveHor, canViewFamiliarisation }) : [];
  const allClear = ready ? dashboardAllClear(ready, actions) : false;
  const today = ready?.today ?? todayDateOnly();

  return (
    <div className="min-w-0 space-y-4" data-crew-dashboard={query.status}>
      <PageHeader
        eyebrow={vessel.name}
        title="Crew dashboard"
        description="Who is on board, and what needs doing for them."
        actions={
          <>
            <Button asChild variant="outline" className="[@media(pointer:coarse)]:h-11">
              <Link to={scopedPath(CREW_PATHS.list)}>
                <List aria-hidden="true" />
                Crew list
              </Link>
            </Button>
            {canAddCrew ? (
              <Button asChild variant="signal" className="[@media(pointer:coarse)]:h-11">
                <Link to={scopedPath(`${CREW_ROOT}/new`)}>
                  <UserPlus aria-hidden="true" />
                  Add crew
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <DashboardTiles tiles={tiles} onRetry={retry} />
      <ActionRequired actions={actions} allClear={allClear} vesselName={vessel.name} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <OnboardingCard
          state={onboarding}
          vesselName={vessel.name}
          today={today}
          canOpenProfiles={canOpenProfiles}
          canOpenFamiliarisation={canViewFamiliarisation}
        />
        <div className="min-w-0 space-y-4">
          <HoursOfRestCard
            state={cardState(query, (d) => d.hoursOfRest, access.hoursOfRest)}
            canOpenProfiles={canOpenProfiles}
            canApprove={canApproveHor}
            onRetry={retry}
          />
          <DocumentsCard
            state={cardState(query, (d) => d.documents, access.documents)}
            today={today}
            canOpenProfiles={canOpenProfiles}
            canOpenReport={ready ? ready.compliance.kind === 'ready' : false}
            onRetry={retry}
          />
        </div>
      </div>
    </div>
  );
};

export default CrewDashboardPage;
