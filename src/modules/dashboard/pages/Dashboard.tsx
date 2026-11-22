import React from 'react';
import { AlertTriangle, ClipboardCheck, FileCheck, Ship, Users } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { KpiGrid, KpiTile } from '@/shared/components/data';
import { useVesselCount } from '@/modules/vessels/hooks/useVessels';
import { useCrewCount, useRecentCrewChanges } from '@/modules/crew/hooks/useCrew';
import { useMandatoryDocumentsPending, useAcknowledgmentStats } from '@/modules/auth/hooks/useAcknowledgments';
import { useOverdueCAPAs, useRecentIncidents } from '@/modules/analytics/hooks/useCAPAAnalytics';
import MaintenanceWidgets from '@/modules/dashboard/components/MaintenanceWidgets';
import DashboardGrid from '@/modules/dashboard/components/DashboardGrid';
import DashboardLayoutControls from '@/modules/dashboard/components/DashboardLayoutControls';
import FleetDashboardHeader from '@/modules/dashboard/components/FleetDashboardHeader';
import {
  AcknowledgementProgressCard,
  OverdueCapasBanner,
  PendingAcknowledgementsBanner,
  QuickLinks,
  RecentCrewChangesCard,
  RecentIncidentsCard,
} from '@/modules/dashboard/components/FleetDashboardWidgets';
import { useDashboardLayout, type WidgetDefinition } from '@/modules/dashboard/hooks/useDashboardLayout';
import { useOpenAlertCounts } from '@/modules/dashboard/hooks/useOpenAlertCounts';
import { kpiStateFor } from '@/modules/dashboard/lib/kpiState';
import DPADashboard from './DPADashboard';

/*
 * Widget ids are stored per user (user_dashboard_layouts), so they never
 * change meaning. The old `welcome` hero, the static `activity` placeholder
 * and the `compliance-summary` tiles (now the KPI row) are gone; a saved
 * layout that still lists them simply skips them.
 */
const WIDGET_DEFS: WidgetDefinition[] = [
  { id: 'overdue-capas', label: 'Overdue CAPAs', description: 'Overdue corrective actions alert', defaultOrder: 0, defaultVisible: true, defaultColSpan: 1 },
  { id: 'pending-docs', label: 'Pending acknowledgements', description: 'Documents waiting for your acknowledgement', defaultOrder: 1, defaultVisible: true, defaultColSpan: 1 },
  { id: 'quick-links', label: 'Quick navigation', description: 'Quick links to key modules', defaultOrder: 2, defaultVisible: true, defaultColSpan: 2 },
  { id: 'recent-incidents', label: 'Recent incidents', description: 'Latest reported incidents', defaultOrder: 3, defaultVisible: true, defaultColSpan: 1 },
  { id: 'ack-stats', label: 'Acknowledgement status', description: 'Document acknowledgement progress', defaultOrder: 4, defaultVisible: true, defaultColSpan: 1 },
  { id: 'crew-changes', label: 'Recent crew changes', description: 'Latest crew movements', defaultOrder: 5, defaultVisible: true, defaultColSpan: 1 },
  { id: 'maintenance', label: 'Maintenance', description: 'Maintenance overview widgets', defaultOrder: 6, defaultVisible: true, defaultColSpan: 1 },
];

const ROLE_LABELS: Record<string, string> = {
  master: 'Master',
  chief_engineer: 'Chief Engineer',
  chief_officer: 'Chief Officer',
  crew: 'Crew',
  dpa: 'DPA',
  shore_management: 'Shore management',
};

/** The fleet dashboard for fleet-reach users other than DPA / shore management (they get DPADashboard). */
const FleetOverviewDashboard: React.FC<{ roleLabel: string | null }> = ({ roleLabel }) => {
  const layout = useDashboardLayout(WIDGET_DEFS);

  const vesselCount = useVesselCount();
  const crewCount = useCrewCount();
  const alerts = useOpenAlertCounts();
  const overdueCapas = useOverdueCAPAs();
  const pendingDocs = useMandatoryDocumentsPending();
  const recentChanges = useRecentCrewChanges(5);
  const { data: ackStats } = useAcknowledgmentStats();
  const { data: recentIncidents } = useRecentIncidents(5);

  const redAlerts = alerts.counts?.RED ?? 0;
  const capaCount = overdueCapas.data?.length ?? 0;
  const pendingCount = pendingDocs.data?.length ?? 0;

  const widgetContent: Record<string, React.ReactNode> = {
    'overdue-capas': capaCount > 0 ? <OverdueCapasBanner count={capaCount} /> : null,
    'pending-docs': pendingDocs.data && pendingCount > 0 ? <PendingAcknowledgementsBanner documents={pendingDocs.data} /> : null,
    'quick-links': <QuickLinks />,
    'recent-incidents': recentIncidents && recentIncidents.length > 0 ? <RecentIncidentsCard incidents={recentIncidents} /> : null,
    'ack-stats': ackStats && ackStats.length > 0 ? <AcknowledgementProgressCard stats={ackStats} /> : null,
    'crew-changes': <RecentCrewChangesCard changes={recentChanges.data} isLoading={recentChanges.isPending} />,
    maintenance: <MaintenanceWidgets />,
  };

  return (
    <div className="space-y-4">
      <FleetDashboardHeader
        description={roleLabel ? `Signed in as ${roleLabel}. What needs attention across your fleet.` : 'What needs attention across your fleet.'}
        actions={<DashboardLayoutControls layout={layout} />}
      />

      <section aria-label="Fleet indicators">
        <KpiGrid className="min-[1440px]:grid-cols-5">
          <KpiTile
            label="Vessels"
            icon={Ship}
            value={vesselCount.data}
            state={kpiStateFor(vesselCount) ?? 'ready'}
            sub="In your fleet"
            href="/fleet/admin/vessels"
            onRetry={() => void vesselCount.refetch()}
          />
          <KpiTile
            label="Active crew"
            icon={Users}
            value={crewCount.data}
            state={kpiStateFor(crewCount) ?? 'ready'}
            sub="People with an active profile"
            href="/crew"
            onRetry={() => void crewCount.refetch()}
          />
          <KpiTile
            label="Open alerts"
            icon={AlertTriangle}
            value={alerts.counts?.total}
            state={alerts.status === 'ready' ? undefined : alerts.status}
            tone={redAlerts > 0 ? 'danger' : alerts.counts && alerts.counts.ORANGE > 0 ? 'orange' : undefined}
            sub={alerts.counts ? `${alerts.counts.RED} red · ${alerts.counts.ORANGE} orange · ${alerts.counts.YELLOW} yellow` : undefined}
            href="/notifications/center"
            onRetry={alerts.retry}
          />
          <KpiTile
            label="Overdue CAPAs"
            icon={ClipboardCheck}
            value={overdueCapas.data?.length}
            state={kpiStateFor(overdueCapas)}
            tone={capaCount > 0 ? 'danger' : undefined}
            sub="Corrective actions past due"
            href="/fleet/reports/capa-tracker"
            onRetry={() => void overdueCapas.refetch()}
          />
          <KpiTile
            label="To acknowledge"
            icon={FileCheck}
            value={pendingDocs.data?.length}
            state={kpiStateFor(pendingDocs)}
            tone={pendingCount > 0 ? 'warn' : undefined}
            sub="Mandatory documents waiting for you"
            zeroLabel="All acknowledged"
            href="/fleet/documents"
            onRetry={() => void pendingDocs.refetch()}
          />
        </KpiGrid>
      </section>

      <DashboardGrid widgetDefs={WIDGET_DEFS} layout={layout}>
        {widgetContent}
      </DashboardGrid>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { profile } = useAuth();

  if (profile?.role === 'dpa' || profile?.role === 'shore_management') {
    return <DPADashboard />;
  }

  return (
    <DashboardLayout>
      <FleetOverviewDashboard roleLabel={profile?.role ? (ROLE_LABELS[profile.role] ?? null) : null} />
    </DashboardLayout>
  );
};

export default Dashboard;
