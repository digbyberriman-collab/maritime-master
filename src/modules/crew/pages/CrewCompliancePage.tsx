import React, { Suspense } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageEmpty, PageLoading } from '@/shared/components/states';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_CAPS, CREW_PATHS, CREW_ROOT } from '@/modules/crew/paths';
import {
  COMPLIANCE_PAGE_TABS,
  COMPLIANCE_PAGE_TAB_LABEL,
  compliancePath,
  parseCompliancePageTab,
  type CompliancePageTab,
} from '@/modules/crew/lib/complianceModel';
import { ComplianceStatusTab, type ComplianceVessel } from '@/modules/crew/components/compliance/ComplianceStatusTab';

// The configuration tab, its matrix and dialogs load only when opened (gap/00 I6).
const ComplianceConfigTab = React.lazy(() => import('@/modules/crew/components/compliance/ComplianceConfigTab'));

const tabLink = (active: boolean) =>
  cn(
    'relative inline-flex h-full shrink-0 snap-start items-center whitespace-nowrap rounded-sm px-3 type-body font-medium transition-colors duration-quick ease-tide',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    'after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-transform after:duration-indicator after:ease-tide',
    active ? 'text-foreground after:scale-x-100 after:shadow-glow-signal' : 'text-muted-foreground after:scale-x-0 hover:text-foreground',
  );


/**
 * Crew Compliance (gap/04 C35, C33, C34, C5; X1-06B) at crew/compliance/:tab:
 * Status (who holds what their position requires, as KPIs and a crew x
 * requirements matrix, cards on phones) and Configuration (the vessel's
 * requirements by position, the equivalence rules and the crew settings).
 * crew/compliance redirects to status, and so does an unknown tab.
 *
 * Gate: vessel.crew.crew_compliance.view on the route vessel (the route
 * guard checks it too): nothing is read while it loads, AccessDenied when
 * denied; the server gates every read again. Configuration edits need
 * crew_compliance.admin; without it the tab is read only, with a notice.
 */
const CrewCompliancePage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const gate = useCapability(CREW_CAPS.complianceView, { vesselId: vessel?.id ?? null });
  const params = useParams();
  const location = useLocation();
  const scopedPath = useScopedPath();
  const tab = parseCompliancePageTab(params.tab);

  if (!vessel) {
    return <PageEmpty title="Choose a vessel" body="Crew compliance belongs to a vessel. Open it from a vessel's Crew tab." />;
  }
  if (tab === null) {
    return <Navigate to={`${scopedPath(compliancePath('status'))}${location.search}`} replace />;
  }
  if (gate.status === 'loading') return <PageLoading variant="tiles" rows={5} label="Checking your access" />;
  if (!gate.allowed) {
    return (
      <AccessDenied
        title="You can't see crew compliance on this vessel"
        detail="Seeing who holds what their position requires needs crew compliance access on this vessel. Ask your fleet manager for it."
      />
    );
  }
  return <ComplianceBody key={vessel.id} vessel={{ id: vessel.id, companyId: vessel.company_id, name: vessel.name }} tab={tab} />;
};

const ComplianceBody: React.FC<{ vessel: ComplianceVessel; tab: CompliancePageTab }> = ({ vessel, tab }) => {
  const scopedPath = useScopedPath();
  const canViewProfiles = useCan(CREW_CAPS.profilesView, { vesselId: vessel.id });
  const profileHref = React.useCallback((profileId: string) => scopedPath(`${CREW_ROOT}/people/${profileId}/documents`), [scopedPath]);

  return (
    <div className="min-w-0 space-y-4" data-crew-compliance={tab}>
      <PageHeader
        eyebrow={vessel.name}
        title="Crew compliance"
        description="Who on board holds what their position requires, and what is missing or running out."
      />
      <nav aria-label="Crew compliance sections" className="min-w-0">
        <ul
          className="flex h-11 max-w-full items-stretch gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain shadow-[inset_0_-1px_0_0_hsl(var(--border))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-compliance-tabs=""
        >
          {COMPLIANCE_PAGE_TABS.map((t) => (
            <li key={t} className="flex shrink-0">
              <Link to={scopedPath(compliancePath(t))} aria-current={t === tab ? 'page' : undefined} className={tabLink(t === tab)}>
                {COMPLIANCE_PAGE_TAB_LABEL[t]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === 'status' ? (
        <ComplianceStatusTab vessel={vessel} configurationHref={scopedPath(compliancePath('configuration'))} profileHref={canViewProfiles ? profileHref : null} />
      ) : (
        <Suspense fallback={<PageLoading variant="list" rows={6} label="Loading the configuration" />}>
          <ComplianceConfigTab vessel={vessel} positionsHref={`${scopedPath(CREW_PATHS.list)}?positions=1`} />
        </Suspense>
      )}
    </div>
  );
};

export default CrewCompliancePage;
