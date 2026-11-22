import React from 'react';
import { AlertCircle, AlertTriangle, ClipboardCheck, Clock, Ship, Users } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { KpiGrid, KpiTile } from '@/shared/components/data';
import { useVesselCount } from '@/modules/vessels/hooks/useVessels';
import { useCrewCount, useRecentCrewChanges } from '@/modules/crew/hooks/useCrew';
import { useOverdueCAPAs } from '@/modules/analytics/hooks/useCAPAAnalytics';
import RedRoomPanel from '@/modules/red-room/components/RedRoomPanel';
import DashboardGrid from '@/modules/dashboard/components/DashboardGrid';
import DashboardLayoutControls from '@/modules/dashboard/components/DashboardLayoutControls';
import FleetDashboardHeader from '@/modules/dashboard/components/FleetDashboardHeader';
import { OverdueCapasBanner, RecentCrewChangesCard } from '@/modules/dashboard/components/FleetDashboardWidgets';
import { useDashboardLayout, type WidgetDefinition } from '@/modules/dashboard/hooks/useDashboardLayout';
import { useOpenAlertCounts } from '@/modules/dashboard/hooks/useOpenAlertCounts';
import { kpiStateFor } from '@/modules/dashboard/lib/kpiState';

/*
 * Widget ids are stored per user. Gone: the `welcome` hero (now the page
 * header), `kpi-tiles` (now the fixed KPI row), `alert-sections` (it showed
 * made-up training, drill, certificate, audit and meeting counts; the KPI row
 * reads the real alert counts) and the static `activity` placeholder.
 */
const DPA_WIDGET_DEFS: WidgetDefinition[] = [
  { id: 'red-room', label: 'Red Room', description: 'Critical alerts requiring immediate action', defaultOrder: 0, defaultVisible: true, defaultColSpan: 2 },
  { id: 'overdue-capas', label: 'Overdue CAPAs', description: 'Overdue corrective actions alert', defaultOrder: 1, defaultVisible: true, defaultColSpan: 1 },
  { id: 'crew-changes', label: 'Recent crew changes', description: 'Latest crew movements', defaultOrder: 2, defaultVisible: true, defaultColSpan: 1 },
];

const ROLE_LABELS: Record<string, string> = {
  dpa: 'DPA',
  shore_management: 'Shore management',
};

/** Fleet dashboard for the Designated Person Ashore and shore management. */
const DPADashboard: React.FC = () => {
  const { profile } = useAuth();
  const layout = useDashboardLayout(DPA_WIDGET_DEFS);

  const vesselCount = useVesselCount();
  const crewCount = useCrewCount();
  const alerts = useOpenAlertCounts();
  const overdueCapas = useOverdueCAPAs();
  const recentChanges = useRecentCrewChanges(5);

  const alertState = alerts.status === 'ready' ? undefined : alerts.status;
  const capaCount = overdueCapas.data?.length ?? 0;
  const roleLabel = profile?.role ? (ROLE_LABELS[profile.role] ?? null) : null;

  const widgetContent: Record<string, React.ReactNode> = {
    'red-room': <RedRoomPanel />,
    'overdue-capas': capaCount > 0 ? <OverdueCapasBanner count={capaCount} /> : null,
    'crew-changes': <RecentCrewChangesCard changes={recentChanges.data} isLoading={recentChanges.isPending} />,
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <FleetDashboardHeader
          description={
            roleLabel
              ? `${roleLabel} view: open alerts, overdue actions and crew movements across the fleet.`
              : 'Open alerts, overdue actions and crew movements across the fleet.'
          }
          actions={<DashboardLayoutControls layout={layout} />}
        />

        <section aria-label="Fleet indicators">
          <KpiGrid>
            <KpiTile
              label="Red alerts"
              icon={AlertCircle}
              value={alerts.counts?.RED}
              state={alertState}
              tone={alerts.counts && alerts.counts.RED > 0 ? 'danger' : undefined}
              sub="Urgent: act now"
              href="/notifications/center"
              onRetry={alerts.retry}
            />
            <KpiTile
              label="Orange alerts"
              icon={AlertTriangle}
              value={alerts.counts?.ORANGE}
              state={alertState}
              tone={alerts.counts && alerts.counts.ORANGE > 0 ? 'orange' : undefined}
              sub="Overdue items"
              href="/notifications/center"
              onRetry={alerts.retry}
            />
            <KpiTile
              label="Yellow alerts"
              icon={Clock}
              value={alerts.counts?.YELLOW}
              state={alertState}
              tone={alerts.counts && alerts.counts.YELLOW > 0 ? 'warn' : undefined}
              sub="Upcoming deadlines"
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
              label="Active crew"
              icon={Users}
              value={crewCount.data}
              state={kpiStateFor(crewCount) ?? 'ready'}
              sub="People with an active profile"
              href="/crew"
              onRetry={() => void crewCount.refetch()}
            />
            <KpiTile
              label="Vessels"
              icon={Ship}
              value={vesselCount.data}
              state={kpiStateFor(vesselCount) ?? 'ready'}
              sub="In your fleet"
              href="/fleet/admin/vessels"
              onRetry={() => void vesselCount.refetch()}
            />
          </KpiGrid>
        </section>

        <DashboardGrid widgetDefs={DPA_WIDGET_DEFS} layout={layout}>
          {widgetContent}
        </DashboardGrid>
      </div>
    </DashboardLayout>
  );
};

export default DPADashboard;
