import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, ClipboardCheck, FileSignature, Lock, ShieldCheck, UserPlus, Users } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { hrisLink, useHrDashboard } from '@/modules/hris/hooks/useHrDashboard';
import { KpiGrid } from '@/modules/hris/components/dashboard/KpiGrid';
import { NeedsAttentionPanel } from '@/modules/hris/components/dashboard/NeedsAttentionPanel';
import { HeadcountBreakdown } from '@/modules/hris/components/dashboard/HeadcountBreakdown';
import { RecentActivity } from '@/modules/hris/components/dashboard/RecentActivity';
import { DataGovernanceTab } from '@/modules/hris/components/dashboard/DataGovernanceTab';
import { MyHrView } from '@/modules/hris/components/dashboard/MyHrView';

type DashboardTab = 'overview' | 'governance';

/** Company-wide dashboard for HR viewers/editors/admins. */
const CompanyDashboard: React.FC<{ module: string | null; tab: DashboardTab; onTabChange: (t: DashboardTab) => void }> = ({ module, tab, onTabChange }) => {
  const dash = useHrDashboard();
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as DashboardTab)} className="w-full">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="governance">
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Data governance
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6 space-y-6">
        <KpiGrid kpis={dash.kpis} module={module} showDisciplinary={dash.access.canEdit} showPayroll={!dash.payroll.loading && dash.payroll.canView} />
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <NeedsAttentionPanel items={dash.attention} isLoading={dash.attentionLoading} error={dash.attentionError} vesselName={dash.vesselName} module={module} />
          </div>
          <div className="space-y-6">
            <HeadcountBreakdown byVessel={dash.breakdown.byVessel} byDepartment={dash.breakdown.byDepartment} byNationality={dash.breakdown.byNationality} isLoading={dash.breakdownLoading} />
          </div>
        </div>
        <RecentActivity rows={dash.activity} isLoading={dash.activityLoading} />
      </TabsContent>

      <TabsContent value="governance" className="mt-6">
        <DataGovernanceTab />
      </TabsContent>
    </Tabs>
  );
};

const HRPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const module = searchParams.get('module');
  const requestedTab = searchParams.get('tab');
  const tab: DashboardTab = requestedTab === 'governance' ? 'governance' : 'overview';
  const access = useHrAccess();

  const setTab = (next: DashboardTab) =>
    setSearchParams(
      (prev) => {
        // Preserve ?module=hris (and anything else) so the layout stays in HRIS.
        const n = new URLSearchParams(prev);
        if (next === 'overview') n.delete('tab');
        else n.set('tab', next);
        return n;
      },
      { replace: true },
    );

  const canEdit = !access.loading && access.canEdit;
  const link = (path: string) => hrisLink(path, { module });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <HrisPageHeader
          icon={Users}
          title="Human Resources"
          description={access.selfOnly ? 'Your own HR records, upcoming dates and payslips.' : 'Crew headcount, upcoming HR dates, records needing attention and data governance.'}
          actions={
            <>
              {access.canView && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={link(HRIS_PATHS.reporting)}>
                    <BarChart3 className="mr-2 h-4 w-4" /> Reports
                  </Link>
                </Button>
              )}
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/crew/roster?module=${module ?? 'hris'}`}>
                      <UserPlus className="mr-2 h-4 w-4" /> Add crew
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={link(HRIS_PATHS.contracts)}>
                      <FileSignature className="mr-2 h-4 w-4" /> New contract
                    </Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to={link(HRIS_PATHS.annualEvaluations)}>
                      <ClipboardCheck className="mr-2 h-4 w-4" /> New review
                    </Link>
                  </Button>
                </>
              )}
            </>
          }
        />

        {access.loading ? null : access.selfOnly ? (
          <MyHrView module={module} />
        ) : access.canView ? (
          <CompanyDashboard module={module} tab={tab} onTabChange={setTab} />
        ) : (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              You do not have HR access. HR records are restricted to the DPA, shore management, masters and heads of department; crew members see only their own records.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </DashboardLayout>
  );
};

export default HRPage;
