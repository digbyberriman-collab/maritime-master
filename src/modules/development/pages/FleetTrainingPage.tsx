/**
 * Fleet › People › Training (`/fleet/training/:tab`; gap/02 TR1–TR3, TR5–TR8,
 * TR10, X1; DECISIONS D-01, D-04, D-27, D-88, D-X5-05, D-X5-06, D-X5-19,
 * D-X5-20; X5 spec X5-07B). The fleet's training in five tabs, one per
 * URL segment:
 *
 * - `overview`: KPI tiles, the estimated cost per currency, applications
 *   awaiting approval for more than 7 days with the approver level, and the
 *   counts by category and status (TrainingOverviewTab);
 * - `by-vessel`: awaiting, approved, completed and spend per vessel (TR2);
 * - `applications`: the one register, filters in the URL, CSV / Excel
 *   (TR3);
 * - `catalogue`: the courses with their rules and the crew proposals
 *   (TR7, TR8);
 * - `settings`: the programme settings (TR10).
 *
 * An unknown segment lands on the overview. Gate:
 * `fleet.operations.fleet_training.view` (the route guard uses the same
 * key); nothing is read while it loads (skeleton) and denied is
 * AccessDenied. A row opens ApplicationDetailModal with the viewer's fleet
 * training parts (training admin, training editor); `?application=<id>`
 * opens one from a link. One freshness stamp for the tab's reads (D-88).
 *
 * Reads go through the pending client where 040600 adds anything; a
 * missing object reads "not set up yet" where it is used, any other
 * failure is PageError with Retry, never sample rows.
 */
import React, { useMemo } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { cn } from '@/lib/utils';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFleetVesselsShown } from '@/modules/fleet';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageError, PageLoading } from '@/shared/components/states';
import ApplicationDetailModal from '../components/ApplicationDetailModal';
import { TrainingApplicationsTab } from '../components/training/TrainingApplicationsTab';
import { TrainingByVesselTab } from '../components/training/TrainingByVesselTab';
import { TrainingCatalogueTab } from '../components/training/TrainingCatalogueTab';
import { TrainingOverviewTab } from '../components/training/TrainingOverviewTab';
import { TrainingSettingsTab } from '../components/training/TrainingSettingsTab';
import { COARSE, FreshnessActions } from '../components/training/TrainingParts';
import { FLEET_TRAINING_TAB_LABELS as TAB_LABELS, parseTrainingTab, todayLocal, type FleetApplicationRow, type RegisterVessel } from '../components/training/fleetTrainingModel';
import { useCatalogueAdmin, useExpenseTotals, useSettingsRow, useTrainingRegister } from '../components/training/useFleetTrainingData';
import { useCategoryLabels, usePolicyExtras } from '../hooks/useProgramSettings';
import type { ApplicationActor } from '../lib/applicationMachine';
import { FLEET_TRAINING_TABS, TRAINING_CAPS, TRAINING_REGISTER_PARAMS, fleetTrainingPath, type FleetTrainingTab } from '../paths';

const FleetTrainingPage: React.FC = () => {
  const access = useCapability(TRAINING_CAPS.view);
  if (access.status === 'loading') return <PageLoading variant="cards" label="Loading fleet training" />;
  if (!access.allowed) {
    return <AccessDenied detail="Fleet training needs access to fleet training. If you think you should see it, ask your account admin." />;
  }
  return <FleetTrainingRoute />;
};

export default FleetTrainingPage;

function FleetTrainingRoute() {
  const { tab: segment } = useParams<{ tab: string }>();
  const tab = parseTrainingTab(segment);
  if (!tab) return <Navigate replace to={fleetTrainingPath('overview')} />;
  return <FleetTrainingBody tab={tab} />;
}

function FleetTrainingBody({ tab }: { tab: FleetTrainingTab }) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const canAdmin = useCan(TRAINING_CAPS.admin);
  const canEdit = useCan(TRAINING_CAPS.edit);
  const canExport = useCan(TRAINING_CAPS.export);
  const today = todayLocal();

  const shown = useFleetVesselsShown();
  const vessels = useMemo<RegisterVessel[]>(
    () => (shown.status === 'ready' ? shown.vessels.map((v) => ({ id: v.id, name: v.name, code: v.code })) : []),
    [shown],
  );
  const extras = usePolicyExtras();
  const labels = useCategoryLabels();
  const mode = extras.data?.final_approval_mode ?? 'both';

  const register = useTrainingRegister(companyId, null, tab !== 'settings');
  const expenses = useExpenseTotals(companyId, tab === 'overview');
  const catalogue = useCatalogueAdmin(companyId, tab === 'catalogue');
  const settings = useSettingsRow(companyId, tab === 'settings');

  const viewerRoles = useMemo<ApplicationActor[]>(() => {
    const roles: ApplicationActor[] = [];
    if (canAdmin) roles.push('training_admin');
    if (canEdit || canAdmin) roles.push('training_editor');
    return roles;
  }, [canAdmin, canEdit]);

  const openId = params.get(TRAINING_REGISTER_PARAMS.application);
  const setOpenId = (id: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set(TRAINING_REGISTER_PARAMS.application, id);
        else next.delete(TRAINING_REGISTER_PARAMS.application);
        return next;
      },
      { replace: true },
    );
  const opened = openId && register.status === 'ready' ? register.rows.find((r) => r.id === openId) ?? null : null;
  const open = (row: FleetApplicationRow) => setOpenId(row.id);

  // One stamp (D-88): the oldest of the reads the tab shows, once they all answered.
  const reads =
    tab === 'overview' ? [register, expenses] : tab === 'catalogue' ? [catalogue, register] : tab === 'settings' ? [settings] : [register];
  const stamps = reads.flatMap((r) => (r.status === 'ready' ? [r.updatedAt] : []));
  const updatedAt = stamps.length === reads.length ? Math.min(...stamps) : null;
  const refreshing = reads.some((r) => r.status === 'ready' && r.refreshing);
  const refresh = () => {
    for (const family of ['fleet-development-applications', 'development-application-lifecycle', 'fleet-development-expenses', 'development-courses', 'development-program-settings']) {
      void queryClient.invalidateQueries({ queryKey: [family, companyId] });
    }
  };

  const header = (
    <PageHeader
      eyebrow="Fleet"
      title="Training"
      description="Crew training across the fleet: what is waiting for approval, what it costs, the catalogue and the programme rules."
      actions={<FreshnessActions updatedAt={updatedAt} refreshing={refreshing} onRefresh={refresh} testId="training-updated" />}
    />
  );

  const tabs = (
    <nav aria-label="Training views" className="-mx-1 overflow-x-auto border-b border-border px-1">
      <ul className="flex min-w-max gap-1">
        {FLEET_TRAINING_TABS.map((key) => (
          <li key={key}>
            <Link
              to={fleetTrainingPath(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={cn(
                'focus-ring -mb-px inline-flex h-10 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-quick',
                COARSE,
                tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[key]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  const needsVessels = tab !== 'settings';
  let body: React.ReactNode;
  if (needsVessels && shown.status === 'error') {
    body = <PageError error={shown.error} title="Your vessels could not be loaded" onRetry={shown.retry} treatMissingAsOff={false} />;
  } else if (needsVessels && shown.status === 'loading') {
    body = <PageLoading variant="cards" rows={4} label="Loading your vessels" />;
  } else {
    switch (tab) {
      case 'overview':
        body = <TrainingOverviewTab register={register} expenses={expenses} mode={mode} vessels={vessels} categoryLabels={labels} today={today} onOpen={open} />;
        break;
      case 'by-vessel':
        body = <TrainingByVesselTab register={register} vessels={vessels} />;
        break;
      case 'applications':
        body = (
          <TrainingApplicationsTab register={register} vessels={vessels} categoryLabels={labels} mode={mode} today={today} canExport={canExport} onOpen={open} />
        );
        break;
      case 'catalogue':
        body = <TrainingCatalogueTab companyId={companyId} catalogue={catalogue} register={register} vessels={vessels} categoryLabels={labels} canAdmin={canAdmin} />;
        break;
      case 'settings':
        body = (
          <TrainingSettingsTab
            companyId={companyId}
            settings={settings}
            extras={
              extras.isError
                ? { status: 'error', error: extras.error, retry: () => void extras.refetch() }
                : extras.data
                  ? { status: 'ready', data: extras.data }
                  : { status: 'loading' }
            }
            canAdmin={canAdmin}
          />
        );
        break;
    }
  }

  return (
    <div className="space-y-4">
      {header}
      {tabs}
      <div role="region" aria-label={TAB_LABELS[tab]}>
        {body}
      </div>
      <ApplicationDetailModal open={Boolean(opened)} onOpenChange={(next) => !next && setOpenId(null)} application={opened} viewerRoles={viewerRoles} />
    </div>
  );
}
