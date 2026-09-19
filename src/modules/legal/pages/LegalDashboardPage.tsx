import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { MetricCards } from '@/modules/legal/components/dashboard/MetricCards';
import { StatusDonut, VolumeBars } from '@/modules/legal/components/dashboard/charts';
import { RequestMiniList } from '@/modules/legal/components/dashboard/RequestMiniList';
import { useLegalRequests } from '@/modules/legal/hooks/useLegalRequests';
import { useLegalAlertSweep } from '@/modules/legal/hooks/useLegalLookups';
import { computeDashboardMetrics, monthlyVolume, recentActivity, statusBreakdown, urgentAttention } from '@/modules/legal/lib/dashboard';
import { errorMessage } from '@/modules/legal/lib/storage';
import { LEGAL_PATHS } from '@/modules/legal/paths';

const LegalDashboardPage: React.FC = () => {
  const access = useLegalAccess();
  const { requests, isLoading, error } = useLegalRequests();
  const sweep = useLegalAlertSweep();

  const metrics = useMemo(() => (isLoading ? null : computeDashboardMetrics(requests)), [requests, isLoading]);
  const slices = useMemo(() => statusBreakdown(requests), [requests]);
  const buckets = useMemo(() => monthlyVolume(requests), [requests]);
  const attention = useMemo(() => urgentAttention(requests), [requests]);
  const recent = useMemo(() => recentActivity(requests), [requests]);

  return (
    <LegalShell
      description={
        access.canEdit
          ? 'Workload, SLA performance and what needs attention across the company.'
          : 'Your legal requests and their progress. Raise a new request when you need an opinion, a contract or a review.'
      }
      actions={
        <>
          {access.canEdit && (
            <Button variant="outline" onClick={() => sweep.mutate()} disabled={sweep.isPending}>
              <BellRing className="mr-2 h-4 w-4" /> Refresh SLA alerts
            </Button>
          )}
          <Button asChild>
            <Link to={LEGAL_PATHS.newRequest}>
              <Plus className="mr-2 h-4 w-4" /> New request
            </Link>
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load legal requests</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <MetricCards metrics={metrics} isLoading={isLoading} />

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <StatusDonut slices={slices} total={requests.length} />
          <VolumeBars buckets={buckets} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <RequestMiniList
          title="Urgent attention"
          description="High or urgent priority, high risk, or past the SLA."
          rows={attention}
          emptyText="Nothing urgent right now."
          variant="attention"
        />
        <RequestMiniList title="Recent activity" description="Most recently updated requests." rows={recent} emptyText="No activity yet." variant="activity" />
      </div>
    </LegalShell>
  );
};

export default LegalDashboardPage;
